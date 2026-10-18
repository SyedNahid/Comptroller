/**
 * Comptroller service — the orchestration core.
 *
 * fundRequest() runs the full loop: mandate check -> (if approved) FX-convert the
 * treasury reserve into the agent's currency on the real Airwallex sandbox ->
 * issue a scoped single-use card (via CardIssuer) -> record everything + audit.
 * NEEDS_HUMAN parks the request as pending; DENY records the refusal.
 *
 * approveFundRequest() executes a parked request after human approval.
 * simulateSpend() authorizes a charge against the card scope, then reconciles and
 * claws back the residual.
 */

import { randomUUID } from "node:crypto";
import type { AirwallexClient } from "../airwallex/client";
import { Ledger } from "../ledger/store";
import { evaluateMandate } from "../mandate/engine";
import { verifyChain, type SignedMandate } from "../mandate/signing";
import type { FundRequest, MandateDecision } from "../mandate/types";
import { toMajor, toMinor, formatMoney } from "../money";
import type { CardIssuer } from "./issuer";

/** Assumed traditional-bank FX markup, used to estimate savings vs Airwallex. */
const BANK_MARKUP = 0.025;

export interface FundResult {
  fundRequestId: string;
  decision: MandateDecision["decision"];
  reason: string;
  status: string;
  checks: MandateDecision["checks"];
  conversion?: {
    sellCurrency: string;
    buyCurrency: string;
    sellAmountMinor: number;
    clientRate: number;
    savedMinor: number;
  };
  card?: { cardId: string; last4: string; stub: boolean };
}

export class Comptroller {
  constructor(
    private ledger: Ledger,
    private ax: AirwallexClient,
    private issuer: CardIssuer,
    private opts: { treasuryReserveCurrency?: string; operatorPublicKeyPem?: string } = {},
  ) {}

  private reserve() {
    return this.opts.treasuryReserveCurrency ?? "USD";
  }

  /** Full flow for a new funding request. */
  async fundRequest(req: FundRequest, now = new Date().toISOString()): Promise<FundResult> {
    const policy = this.ledger.getPolicy(req.agentId);
    if (!policy) {
      throw new Error(`No policy for agent ${req.agentId}`);
    }

    // Verify the agent's cryptographically signed mandate BEFORE anything else.
    // No valid signature (or tampered/expired) → refuse to move money.
    if (this.opts.operatorPublicKeyPem) {
      const sm = this.ledger.getMandate<SignedMandate>(req.agentId);
      const v = sm
        ? verifyChain(
            sm,
            (id) => this.ledger.getMandate<SignedMandate>(id),
            this.opts.operatorPublicKeyPem,
            (nonce) => this.ledger.isRevoked(nonce),
          )
        : { valid: false, reason: "no signed mandate on file" };
      if (!v.valid) {
        const frId = this.ledger.createFundRequest({
          agentId: req.agentId,
          task: req.task,
          amountMinor: req.amountMinor,
          currency: req.currency,
          merchantCategory: req.merchantCategory,
          merchantName: req.merchantName,
          decision: "DENY",
          status: "DENIED",
          reason: `Mandate not verified — ${v.reason}`,
          createdAt: now,
        });
        this.ledger.appendAudit({
          ts: now,
          agentId: req.agentId,
          fundRequestId: frId,
          type: "MANDATE_INVALID",
          message: `Refused — signed mandate failed verification: ${v.reason}`,
        });
        return {
          fundRequestId: frId,
          decision: "DENY",
          reason: `Mandate not verified — ${v.reason}`,
          status: "DENIED",
          checks: [],
        };
      }
    }

    const spentToday = this.ledger.getSpentTodayMinor(req.agentId, req.currency);
    const decision = evaluateMandate(req, policy, spentToday);

    const status =
      decision.decision === "AUTO_APPROVE"
        ? "APPROVED"
        : decision.decision === "NEEDS_HUMAN"
          ? "PENDING_APPROVAL"
          : "DENIED";

    const frId = this.ledger.createFundRequest({
      agentId: req.agentId,
      task: req.task,
      amountMinor: req.amountMinor,
      currency: req.currency,
      merchantCategory: req.merchantCategory,
      merchantName: req.merchantName,
      decision: decision.decision,
      status,
      reason: decision.reason,
      createdAt: now,
    });

    this.ledger.appendAudit({
      ts: now,
      agentId: req.agentId,
      fundRequestId: frId,
      type: `MANDATE_${decision.decision}`,
      message: decision.reason,
      data: { checks: decision.checks },
    });

    if (decision.decision !== "AUTO_APPROVE") {
      return {
        fundRequestId: frId,
        decision: decision.decision,
        reason: decision.reason,
        status,
        checks: decision.checks,
      };
    }

    return this.execute(frId, req, now);
  }

  /** Execute a parked NEEDS_HUMAN request after a human approves it. */
  async approveFundRequest(id: string, now = new Date().toISOString()): Promise<FundResult> {
    const row = this.ledger.getFundRequest(id);
    if (!row) throw new Error(`No fund request ${id}`);
    if (row.status !== "PENDING_APPROVAL") {
      throw new Error(`Fund request ${id} is ${row.status}, not PENDING_APPROVAL`);
    }
    this.ledger.appendAudit({
      ts: now,
      agentId: row.agent_id,
      fundRequestId: id,
      type: "HUMAN_APPROVED",
      message: `Human approved ${formatMoney(row.amount_minor, row.currency)} for "${row.task}"`,
    });
    const req: FundRequest = {
      agentId: row.agent_id,
      task: row.task,
      amountMinor: row.amount_minor,
      currency: row.currency,
      merchantCategory: row.merchant_cat ?? undefined,
      merchantName: row.merchant_name ?? undefined,
    };
    return this.execute(id, req, now);
  }

  /** Shared: FX-convert (if needed) then issue the scoped card. */
  private async execute(frId: string, req: FundRequest, now: string): Promise<FundResult> {
    const result: FundResult = {
      fundRequestId: frId,
      decision: "AUTO_APPROVE",
      reason: "Executing",
      status: "FUNDED",
      checks: [],
    };

    // 1. FX: convert treasury reserve -> agent currency if they differ.
    const reserve = this.reserve();
    if (reserve !== req.currency) {
      const conv = (await this.ax.createConversion({
        request_id: randomUUID(),
        buy_currency: req.currency,
        sell_currency: reserve,
        buy_amount: toMajor(req.amountMinor),
        reason: "other",
        term_agreement: true,
      })) as {
        conversion_id?: string;
        sell_amount?: number;
        client_rate?: number;
        awx_rate?: number;
        mid_rate?: number;
      };

      const sellAmountMinor = toMinor(conv.sell_amount ?? 0);
      // Estimate savings vs a traditional bank markup, net of Airwallex's margin.
      const awxMargin =
        conv.client_rate && conv.mid_rate
          ? Math.abs(conv.client_rate - conv.mid_rate) / conv.mid_rate
          : 0;
      const savedMinor = Math.max(0, Math.round(sellAmountMinor * (BANK_MARKUP - awxMargin)));

      this.ledger.recordConversion({
        fundRequestId: frId,
        conversionId: conv.conversion_id,
        buyCurrency: req.currency,
        sellCurrency: reserve,
        buyAmountMinor: req.amountMinor,
        sellAmountMinor,
        clientRate: conv.client_rate,
        awxRate: conv.awx_rate,
        savedMinor,
        createdAt: now,
      });
      this.ledger.appendAudit({
        ts: now,
        agentId: req.agentId,
        fundRequestId: frId,
        type: "FX_CONVERTED",
        message: `Converted ${formatMoney(sellAmountMinor, reserve)} -> ${formatMoney(req.amountMinor, req.currency)} (est. saved ${formatMoney(savedMinor, reserve)} vs bank)`,
        data: { conversionId: conv.conversion_id, clientRate: conv.client_rate },
      });
      result.conversion = {
        sellCurrency: reserve,
        buyCurrency: req.currency,
        sellAmountMinor,
        clientRate: conv.client_rate ?? 0,
        savedMinor,
      };
    }

    // 2. Issue the scoped, single-use card.
    const card = await this.issuer.issueCard({
      currency: req.currency,
      limitMinor: req.amountMinor,
      merchantCategories: req.merchantCategory ? [req.merchantCategory] : [],
      singleUse: true,
      reference: frId,
    });
    this.ledger.recordCard({
      fundRequestId: frId,
      cardId: card.cardId,
      currency: card.currency,
      limitMinor: card.limitMinor,
      merchantCat: req.merchantCategory,
      singleUse: card.singleUse,
      status: card.status,
      createdAt: now,
    });
    this.ledger.appendAudit({
      ts: now,
      agentId: req.agentId,
      fundRequestId: frId,
      type: "CARD_ISSUED",
      message: `Issued ${card.stub ? "(stub) " : ""}single-use card ••${card.last4}, limit ${formatMoney(card.limitMinor, card.currency)}${req.merchantCategory ? `, MCC ${req.merchantCategory}` : ""}`,
      data: { cardId: card.cardId, stub: card.stub },
    });

    this.ledger.setFundRequestStatus(frId, "FUNDED");
    result.reason = "Funded";
    result.card = { cardId: card.cardId, last4: card.last4, stub: card.stub };
    return result;
  }

  /**
   * Real supplier payout — a governed Airwallex transfer (money actually leaves
   * the account). Same mandate gate as a card request; this is the "real money
   * movement" path that works today without card issuing.
   */
  async payBeneficiary(
    input: { agentId: string; task: string; amountMinor: number; currency: string; supplierName: string; merchantCategory?: string },
    now = new Date().toISOString(),
  ): Promise<{ decision: string; reason: string; transferId?: string; feeMinor?: number }> {
    const policy = this.ledger.getPolicy(input.agentId);
    if (!policy) throw new Error(`No policy for agent ${input.agentId}`);

    // Mandate chain + policy evaluation (identical trust gate as card funding).
    if (this.opts.operatorPublicKeyPem) {
      const sm = this.ledger.getMandate<SignedMandate>(input.agentId);
      const v = sm
        ? verifyChain(sm, (id) => this.ledger.getMandate<SignedMandate>(id), this.opts.operatorPublicKeyPem, (n) => this.ledger.isRevoked(n))
        : { valid: false, reason: "no signed mandate" };
      if (!v.valid) return { decision: "DENY", reason: `Mandate not verified — ${v.reason}` };
    }
    const spent = this.ledger.getSpentTodayMinor(input.agentId, input.currency);
    const decision = evaluateMandate(
      { agentId: input.agentId, task: input.task, amountMinor: input.amountMinor, currency: input.currency, merchantCategory: input.merchantCategory },
      policy,
      spent,
    );
    const frId = this.ledger.createFundRequest({
      agentId: input.agentId,
      task: input.task,
      amountMinor: input.amountMinor,
      currency: input.currency,
      merchantCategory: input.merchantCategory,
      merchantName: input.supplierName,
      decision: decision.decision,
      status: decision.decision === "AUTO_APPROVE" ? "FUNDED" : decision.decision === "NEEDS_HUMAN" ? "PENDING_APPROVAL" : "DENIED",
      reason: decision.reason,
      createdAt: now,
    });
    this.ledger.appendAudit({ ts: now, agentId: input.agentId, fundRequestId: frId, type: `MANDATE_${decision.decision}`, message: decision.reason });
    if (decision.decision !== "AUTO_APPROVE") {
      return { decision: decision.decision, reason: decision.reason };
    }

    // Execute a real Airwallex transfer to the supplier (USD/ACH beneficiary).
    const transfer = (await this.ax.createTransfer({
      request_id: randomUUID(),
      transfer_amount: String(toMajor(input.amountMinor)),
      transfer_currency: input.currency,
      transfer_method: "LOCAL",
      source_currency: input.currency,
      reason: "goods",
      reference: `Comptroller ${input.task}`,
      transfer_date: now.slice(0, 10),
      beneficiary: {
        entity_type: "COMPANY",
        company_name: input.supplierName,
        address: { city: "Seattle", country_code: "US", postcode: "98104", state: "Washington", street_address: "412 5th Avenue" },
        bank_details: {
          account_currency: input.currency,
          account_name: input.supplierName,
          account_number: "50001121",
          account_routing_type1: "aba",
          account_routing_value1: "021000021",
          bank_country_code: "US",
          bank_account_category: "Checking",
          local_clearing_system: "ACH",
        },
      },
    })) as { id?: string; short_reference_id?: string; status?: string; fee_amount?: number };

    const feeMinor = toMinor(transfer.fee_amount ?? 0);
    this.ledger.recordTransfer({
      fundRequestId: frId,
      transferId: transfer.id,
      shortRef: transfer.short_reference_id,
      beneficiary: input.supplierName,
      amountMinor: input.amountMinor,
      currency: input.currency,
      feeMinor,
      status: transfer.status ?? "SCHEDULED",
      createdAt: now,
    });
    this.ledger.appendAudit({
      ts: now,
      agentId: input.agentId,
      fundRequestId: frId,
      type: "PAYOUT_SENT",
      message: `Real transfer ${formatMoney(input.amountMinor, input.currency)} → ${input.supplierName} (${transfer.status}, ref ${transfer.short_reference_id})`,
      data: { transferId: transfer.id },
    });
    return { decision: "AUTO_APPROVE", reason: "Transfer sent", transferId: transfer.id, feeMinor };
  }

  /**
   * Simulate the agent spending on its card, authorize against the scope, then
   * reconcile + claw back the residual. Mirrors what native spend controls /
   * remote authorization will do once issuing is live.
   */
  async simulateSpend(
    input: {
      fundRequestId: string;
      spendMinor: number;
      merchantCategory?: string;
    },
    now = new Date().toISOString(),
  ): Promise<{ result: "AUTHORIZED" | "DECLINED"; reason: string }> {
    const fr = this.ledger.getFundRequest(input.fundRequestId);
    if (!fr) throw new Error(`No fund request ${input.fundRequestId}`);
    const cardRow = this.ledger
      .getCards()
      .find((c) => c.fund_request_id === input.fundRequestId) as
      | { card_id: string; limit_minor: number; merchant_cat: string | null }
      | undefined;
    if (!cardRow) throw new Error(`No card for fund request ${input.fundRequestId}`);

    // Authorize: must be within limit and (if scoped) matching merchant category.
    const overLimit = input.spendMinor > cardRow.limit_minor;
    const mccMismatch =
      cardRow.merchant_cat != null &&
      input.merchantCategory != null &&
      input.merchantCategory !== cardRow.merchant_cat;

    let out: { result: "AUTHORIZED" | "DECLINED"; reason: string };
    if (overLimit) {
      out = {
        result: "DECLINED",
        reason: `Over card limit (${formatMoney(input.spendMinor, fr.currency)} > ${formatMoney(cardRow.limit_minor, fr.currency)})`,
      };
    } else if (mccMismatch) {
      out = {
        result: "DECLINED",
        reason: `Merchant category ${input.merchantCategory} not allowed on this card (${cardRow.merchant_cat})`,
      };
    } else {
      out = { result: "AUTHORIZED", reason: "Within card scope" };
    }

    this.ledger.recordAuthorization({
      cardId: cardRow.card_id,
      fundRequestId: input.fundRequestId,
      amountMinor: input.spendMinor,
      currency: fr.currency,
      merchantCat: input.merchantCategory,
      result: out.result,
      reason: out.reason,
      createdAt: now,
    });
    this.ledger.appendAudit({
      ts: now,
      agentId: fr.agent_id,
      fundRequestId: input.fundRequestId,
      type: `AUTH_${out.result}`,
      message: `${out.result}: ${out.reason}`,
    });

    // Reconcile + clawback residual on an authorized single-use spend.
    if (out.result === "AUTHORIZED") {
      const residual = cardRow.limit_minor - input.spendMinor;
      await this.issuer.cancelCard(cardRow.card_id);
      this.ledger.setCardStatus(cardRow.card_id, "CANCELLED");
      this.ledger.recordClawback({
        fundRequestId: input.fundRequestId,
        cardId: cardRow.card_id,
        residualMinor: residual,
        createdAt: now,
      });
      this.ledger.setFundRequestStatus(input.fundRequestId, "SETTLED");
      this.ledger.appendAudit({
        ts: now,
        agentId: fr.agent_id,
        fundRequestId: input.fundRequestId,
        type: "CLAWBACK",
        message: `Reconciled spend ${formatMoney(input.spendMinor, fr.currency)}; clawed back ${formatMoney(residual, fr.currency)}; card cancelled`,
      });
    }

    return out;
  }
}
