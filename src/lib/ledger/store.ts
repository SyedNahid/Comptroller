/**
 * Ledger store backed by Node's built-in SQLite (`node:sqlite`, Node 22+/25).
 * Zero native dependencies. For local dev + demo; swap for Postgres/Neon when we
 * deploy. All amounts are integer minor units.
 */

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { SCHEMA } from "./schema.sql";
import type { AgentPolicy, Decision } from "../mandate/types";

export interface FundRequestRow {
  id: string;
  agent_id: string;
  task: string;
  amount_minor: number;
  currency: string;
  merchant_cat: string | null;
  merchant_name: string | null;
  decision: Decision;
  status: string;
  reason: string;
  created_at: string;
  day: string;
}

export interface AuditRow {
  id: number;
  ts: string;
  agent_id: string | null;
  fund_request_id: string | null;
  type: string;
  message: string;
  data_json: string | null;
}

export interface RiskStateRow {
  agent_id: string;
  score: number;
  band: string;
  action: string;
  factors_json: string | null;
  frozen: number;
  trust: number;
  baseline_json: string | null;
  cleared_at: string | null;
  updated_at: string | null;
}

/** ISO date (YYYY-MM-DD) for daily-cap aggregation. Injectable for tests. */
export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export class Ledger {
  private db: DatabaseSync;

  constructor(path = ".data/comptroller.db") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  close() {
    this.db.close();
  }

  /** Clear all activity AND the fleet (agents + mandates, so delegated
   *  children don't survive). The caller re-seeds and re-signs roots. */
  reset() {
    for (const t of [
      "fund_requests",
      "conversions",
      "cards",
      "authorizations",
      "clawbacks",
      "transfers",
      "audit_log",
      "revocations",
      "agent_risk",
      "mandates",
      "agents",
    ]) {
      this.db.exec(`DELETE FROM ${t};`);
    }
  }

  // ---- Agents & policies --------------------------------------------------

  upsertAgent(policy: AgentPolicy) {
    this.db
      .prepare(
        `INSERT INTO agents (agent_id, display_name, base_currency, policy_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET
           display_name = excluded.display_name,
           base_currency = excluded.base_currency,
           policy_json = excluded.policy_json`,
      )
      .run(policy.agentId, policy.displayName, policy.baseCurrency, JSON.stringify(policy));
  }

  getPolicy(agentId: string): AgentPolicy | undefined {
    const row = this.db
      .prepare(`SELECT policy_json FROM agents WHERE agent_id = ?`)
      .get(agentId) as { policy_json: string } | undefined;
    return row ? (JSON.parse(row.policy_json) as AgentPolicy) : undefined;
  }

  getAgents(): AgentPolicy[] {
    const rows = this.db.prepare(`SELECT policy_json FROM agents`).all() as {
      policy_json: string;
    }[];
    return rows.map((r) => JSON.parse(r.policy_json) as AgentPolicy);
  }

  /** Sum of approved/funded spend for an agent+currency on a given day. */
  getSpentTodayMinor(agentId: string, currency: string, day = today()): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(amount_minor), 0) AS total
         FROM fund_requests
         WHERE agent_id = ? AND currency = ? AND day = ?
           AND decision IN ('AUTO_APPROVE','NEEDS_HUMAN')
           AND status IN ('APPROVED','FUNDED','SETTLED')`,
      )
      .get(agentId, currency, day) as { total: number };
    return row.total;
  }

  // ---- Fund requests ------------------------------------------------------

  createFundRequest(input: {
    agentId: string;
    task: string;
    amountMinor: number;
    currency: string;
    merchantCategory?: string;
    merchantName?: string;
    decision: Decision;
    status: string;
    reason: string;
    createdAt: string;
  }): string {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO fund_requests
          (id, agent_id, task, amount_minor, currency, merchant_cat, merchant_name,
           decision, status, reason, created_at, day)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.agentId,
        input.task,
        input.amountMinor,
        input.currency,
        input.merchantCategory ?? null,
        input.merchantName ?? null,
        input.decision,
        input.status,
        input.reason,
        input.createdAt,
        input.createdAt.slice(0, 10),
      );
    return id;
  }

  setFundRequestStatus(id: string, status: string) {
    this.db.prepare(`UPDATE fund_requests SET status = ? WHERE id = ?`).run(status, id);
  }

  getFundRequest(id: string): FundRequestRow | undefined {
    return this.db
      .prepare(`SELECT * FROM fund_requests WHERE id = ?`)
      .get(id) as unknown as FundRequestRow | undefined;
  }

  getFundRequests(limit = 100): FundRequestRow[] {
    return this.db
      .prepare(`SELECT * FROM fund_requests ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as unknown as FundRequestRow[];
  }

  // ---- Money movement records --------------------------------------------

  recordConversion(c: {
    fundRequestId: string;
    conversionId?: string;
    buyCurrency: string;
    sellCurrency: string;
    buyAmountMinor: number;
    sellAmountMinor: number;
    clientRate?: number;
    awxRate?: number;
    savedMinor: number;
    createdAt: string;
  }) {
    this.db
      .prepare(
        `INSERT INTO conversions
          (id, fund_request_id, conversion_id, buy_currency, sell_currency,
           buy_amount_minor, sell_amount_minor, client_rate, awx_rate, saved_minor, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        c.fundRequestId,
        c.conversionId ?? null,
        c.buyCurrency,
        c.sellCurrency,
        c.buyAmountMinor,
        c.sellAmountMinor,
        c.clientRate ?? null,
        c.awxRate ?? null,
        c.savedMinor,
        c.createdAt,
      );
  }

  recordCard(c: {
    fundRequestId: string;
    cardId: string;
    currency: string;
    limitMinor: number;
    merchantCat?: string;
    singleUse: boolean;
    status: string;
    createdAt: string;
  }) {
    this.db
      .prepare(
        `INSERT INTO cards
          (id, fund_request_id, card_id, currency, limit_minor, merchant_cat, single_use, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        c.fundRequestId,
        c.cardId,
        c.currency,
        c.limitMinor,
        c.merchantCat ?? null,
        c.singleUse ? 1 : 0,
        c.status,
        c.createdAt,
      );
  }

  setCardStatus(cardId: string, status: string) {
    this.db.prepare(`UPDATE cards SET status = ? WHERE card_id = ?`).run(status, cardId);
  }

  recordAuthorization(a: {
    cardId: string;
    fundRequestId: string;
    amountMinor: number;
    currency: string;
    merchantCat?: string;
    result: "AUTHORIZED" | "DECLINED";
    reason: string;
    createdAt: string;
  }) {
    this.db
      .prepare(
        `INSERT INTO authorizations
          (id, card_id, fund_request_id, amount_minor, currency, merchant_cat, result, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        a.cardId,
        a.fundRequestId,
        a.amountMinor,
        a.currency,
        a.merchantCat ?? null,
        a.result,
        a.reason,
        a.createdAt,
      );
  }

  recordClawback(c: {
    fundRequestId: string;
    cardId: string;
    residualMinor: number;
    createdAt: string;
  }) {
    this.db
      .prepare(
        `INSERT INTO clawbacks (id, fund_request_id, card_id, residual_minor, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), c.fundRequestId, c.cardId, c.residualMinor, c.createdAt);
  }

  recordTransfer(t: {
    fundRequestId: string;
    transferId?: string;
    shortRef?: string;
    beneficiary: string;
    amountMinor: number;
    currency: string;
    feeMinor: number;
    status: string;
    createdAt: string;
  }) {
    this.db
      .prepare(
        `INSERT INTO transfers
          (id, fund_request_id, transfer_id, short_ref, beneficiary, amount_minor, currency, fee_minor, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        t.fundRequestId,
        t.transferId ?? null,
        t.shortRef ?? null,
        t.beneficiary,
        t.amountMinor,
        t.currency,
        t.feeMinor,
        t.status,
        t.createdAt,
      );
  }

  getTransfers(limit = 100) {
    return this.db
      .prepare(`SELECT * FROM transfers ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as unknown as Record<string, unknown>[];
  }

  getConversions(limit = 100) {
    return this.db
      .prepare(`SELECT * FROM conversions ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as unknown as Record<string, unknown>[];
  }

  getCards(limit = 100) {
    return this.db
      .prepare(`SELECT * FROM cards ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as unknown as Record<string, unknown>[];
  }

  getCardByCardId(cardId: string) {
    return this.db.prepare(`SELECT * FROM cards WHERE card_id = ?`).get(cardId) as
      | { card_id: string; fund_request_id: string; limit_minor: number; merchant_cat: string | null; currency: string }
      | undefined;
  }

  getAuthorizations(limit = 100) {
    return this.db
      .prepare(`SELECT * FROM authorizations ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as unknown as Record<string, unknown>[];
  }

  totalSavedMinor(): number {
    const row = this.db
      .prepare(`SELECT COALESCE(SUM(saved_minor), 0) AS total FROM conversions`)
      .get() as { total: number };
    return row.total;
  }

  // ---- Signed mandates ----------------------------------------------------

  upsertMandate(agentId: string, signed: unknown, createdAt: string) {
    this.db
      .prepare(
        `INSERT INTO mandates (agent_id, signed_json, created_at) VALUES (?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET signed_json = excluded.signed_json,
           created_at = excluded.created_at`,
      )
      .run(agentId, JSON.stringify(signed), createdAt);
  }

  getMandate<T = unknown>(agentId: string): T | undefined {
    const row = this.db
      .prepare(`SELECT signed_json FROM mandates WHERE agent_id = ?`)
      .get(agentId) as { signed_json: string } | undefined;
    return row ? (JSON.parse(row.signed_json) as T) : undefined;
  }

  countMandates(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM mandates`).get() as { n: number };
    return row.n;
  }

  revokeNonce(nonce: string) {
    this.db
      .prepare(`INSERT OR IGNORE INTO revocations (nonce, created_at) VALUES (?, ?)`)
      .run(nonce, new Date().toISOString());
  }

  isRevoked(nonce: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM revocations WHERE nonce = ?`).get(nonce);
  }

  /** Demo: corrupt a stored mandate's signature so verification fails. */
  tamperMandate(agentId: string) {
    const row = this.db
      .prepare(`SELECT signed_json FROM mandates WHERE agent_id = ?`)
      .get(agentId) as { signed_json: string } | undefined;
    if (!row) return;
    const sm = JSON.parse(row.signed_json) as { doc: { constraints: { perTaskCapMinor: number } } };
    // Raise the cap WITHOUT re-signing — signature no longer matches the doc.
    sm.doc.constraints.perTaskCapMinor += 10_000_00;
    this.db.prepare(`UPDATE mandates SET signed_json = ? WHERE agent_id = ?`).run(JSON.stringify(sm), agentId);
  }

  // ---- Audit --------------------------------------------------------------

  appendAudit(entry: {
    ts: string;
    agentId?: string;
    fundRequestId?: string;
    type: string;
    message: string;
    data?: unknown;
  }) {
    this.db
      .prepare(
        `INSERT INTO audit_log (ts, agent_id, fund_request_id, type, message, data_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.ts,
        entry.agentId ?? null,
        entry.fundRequestId ?? null,
        entry.type,
        entry.message,
        entry.data !== undefined ? JSON.stringify(entry.data) : null,
      );
  }

  getAuditLog(limit = 200): AuditRow[] {
    return this.db
      .prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`)
      .all(limit) as unknown as AuditRow[];
  }

  // ---- Adaptive Loop: risk + circuit-breaker state ------------------------

  getRiskState(agentId: string): RiskStateRow | undefined {
    return this.db
      .prepare(`SELECT * FROM agent_risk WHERE agent_id = ?`)
      .get(agentId) as unknown as RiskStateRow | undefined;
  }

  getRiskStates(): RiskStateRow[] {
    return this.db
      .prepare(`SELECT * FROM agent_risk`)
      .all() as unknown as RiskStateRow[];
  }

  /** Persist the latest risk assessment + governance state for an agent. */
  upsertRiskState(s: {
    agentId: string;
    score: number;
    band: string;
    action: string;
    factors?: unknown;
    frozen: boolean;
    trust: number;
    baseline?: unknown;
    clearedAt?: string;
    updatedAt: string;
  }) {
    this.db
      .prepare(
        `INSERT INTO agent_risk
           (agent_id, score, band, action, factors_json, frozen, trust, baseline_json, cleared_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET
           score = excluded.score,
           band = excluded.band,
           action = excluded.action,
           factors_json = excluded.factors_json,
           frozen = excluded.frozen,
           trust = excluded.trust,
           -- keep the first-seen baseline / last clear unless explicitly provided
           baseline_json = COALESCE(excluded.baseline_json, agent_risk.baseline_json),
           cleared_at = COALESCE(excluded.cleared_at, agent_risk.cleared_at),
           updated_at = excluded.updated_at`,
      )
      .run(
        s.agentId,
        s.score,
        s.band,
        s.action,
        s.factors !== undefined ? JSON.stringify(s.factors) : null,
        s.frozen ? 1 : 0,
        s.trust,
        s.baseline !== undefined ? JSON.stringify(s.baseline) : null,
        s.clearedAt ?? null,
        s.updatedAt,
      );
  }

  setAgentFrozen(agentId: string, frozen: boolean, at: string) {
    this.db
      .prepare(
        `INSERT INTO agent_risk (agent_id, frozen, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET frozen = excluded.frozen, updated_at = excluded.updated_at`,
      )
      .run(agentId, frozen ? 1 : 0, at);
  }

  isAgentFrozen(agentId: string): boolean {
    const row = this.db
      .prepare(`SELECT frozen FROM agent_risk WHERE agent_id = ?`)
      .get(agentId) as { frozen: number } | undefined;
    return !!row && row.frozen === 1;
  }
}
