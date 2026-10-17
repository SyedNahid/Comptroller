/**
 * Card issuer abstraction.
 *
 * `AirwallexCardIssuer` is the real implementation (works once the sandbox
 * issuing program is enabled — see docs/SUPPORT_REQUEST.md). `StubCardIssuer`
 * returns a realistic fake card so the whole Comptroller flow + demo work today,
 * before enablement. The service depends only on the `CardIssuer` interface, so
 * we swap implementations with one line when issuing goes live.
 */

import { randomUUID } from "node:crypto";
import type { AirwallexClient } from "../airwallex/client";
import { toMajor } from "../money";

export interface IssueCardInput {
  cardholderId?: string;
  currency: string;
  limitMinor: number;
  merchantCategories: string[];
  singleUse: boolean;
  reference: string; // our fund_request id, for traceability
}

export interface IssuedCard {
  cardId: string;
  last4: string;
  currency: string;
  limitMinor: number;
  merchantCategories: string[];
  singleUse: boolean;
  status: "ISSUED" | "FROZEN" | "CANCELLED";
  stub: boolean;
}

export interface CardIssuer {
  readonly kind: "stub" | "live";
  issueCard(input: IssueCardInput): Promise<IssuedCard>;
  cancelCard(cardId: string): Promise<void>;
}

/** Deterministic stub — no external calls. */
export class StubCardIssuer implements CardIssuer {
  readonly kind = "stub" as const;
  private counter = 4100;

  async issueCard(input: IssueCardInput): Promise<IssuedCard> {
    this.counter += 1;
    return {
      cardId: `stub_${randomUUID()}`,
      last4: String(this.counter).slice(-4),
      currency: input.currency,
      limitMinor: input.limitMinor,
      merchantCategories: input.merchantCategories,
      singleUse: input.singleUse,
      status: "ISSUED",
      stub: true,
    };
  }

  async cancelCard(_cardId: string): Promise<void> {
    // no-op
  }
}

/** Real Airwallex issuing. Requires issuing program enabled on the account. */
export class AirwallexCardIssuer implements CardIssuer {
  readonly kind = "live" as const;
  constructor(
    private ax: AirwallexClient,
    private cardholderId: string,
  ) {}

  async issueCard(input: IssueCardInput): Promise<IssuedCard> {
    const card = (await this.ax.createCard({
      request_id: randomUUID(),
      cardholder_id: input.cardholderId ?? this.cardholderId,
      created_by: "Comptroller",
      form_factor: "VIRTUAL",
      issue_to: "INDIVIDUAL",
      type: "GOOD_FUNDS_CREDIT",
      is_personalized: false,
      purpose: "ONLINE_PURCHASING",
      authorization_controls: {
        allowed_currencies: [input.currency],
        allowed_transaction_count: input.singleUse ? "SINGLE" : "MULTIPLE",
        ...(input.merchantCategories.length
          ? { allowed_merchant_categories: input.merchantCategories }
          : {}),
        transaction_limits: {
          currency: input.currency,
          limits: [{ amount: toMajor(input.limitMinor), interval: "ALL_TIME" }],
        },
      },
    })) as { card_id?: string; card_number_last_four?: string; card_status?: string };

    return {
      cardId: card.card_id ?? "unknown",
      last4: card.card_number_last_four ?? "----",
      currency: input.currency,
      limitMinor: input.limitMinor,
      merchantCategories: input.merchantCategories,
      singleUse: input.singleUse,
      status: "ISSUED",
      stub: false,
    };
  }

  async cancelCard(cardId: string): Promise<void> {
    await this.ax.request("POST", `/api/v1/issuing/cards/${cardId}/cancel`, {
      apiVersion: "2024-01-31",
    });
  }
}
