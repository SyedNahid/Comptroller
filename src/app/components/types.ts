export interface AgentPolicy {
  agentId: string;
  displayName: string;
  baseCurrency: string;
  allowedCurrencies: string[];
  allowedMerchantCategories: string[];
  perTaskCapMinor: number;
  dailyCapMinor: number;
  autoApproveThresholdMinor: number;
}
export interface FundRequestRow {
  id: string;
  agent_id: string;
  task: string;
  amount_minor: number;
  currency: string;
  merchant_name: string | null;
  decision: string;
  status: string;
  reason: string;
}
export interface AuditRow {
  id: number;
  ts: string;
  type: string;
  message: string;
}
export interface Balance {
  currency: string;
  available_amount: number;
}
export interface MandateStatus {
  verified: boolean;
  reason: string;
  issuer?: string;
  depth?: number;
}
export interface State {
  issuingKind: string;
  operatorFingerprint: string;
  mandates: Record<string, MandateStatus>;
  agents: AgentPolicy[];
  requests: FundRequestRow[];
  audit: AuditRow[];
  totalSavedMinor: number;
  balances: Balance[];
  conversions?: unknown[];
  cards?: unknown[];
  authorizations?: unknown[];
  transfers?: {
    transfer_id: string | null;
    short_ref: string | null;
    beneficiary: string;
    amount_minor: number;
    currency: string;
    fee_minor: number;
    status: string;
  }[];
}

import type { ComponentProps } from "react";
import { Pill } from "./ui";

type Tone = ComponentProps<typeof Pill>["tone"];

export const DECISION_TONE: Record<string, Tone> = {
  AUTO_APPROVE: "emerald",
  NEEDS_HUMAN: "amber",
  DENY: "rose",
};

/** Audit event → {tone, dot-color, label} for the activity feed. */
export const AUDIT_META: Record<string, { tone: Tone; dot: string }> = {
  MANDATE_AUTO_APPROVE: { tone: "emerald", dot: "bg-emerald-500" },
  MANDATE_NEEDS_HUMAN: { tone: "amber", dot: "bg-amber-500" },
  MANDATE_DENY: { tone: "rose", dot: "bg-rose-500" },
  FX_CONVERTED: { tone: "sky", dot: "bg-sky-500" },
  CARD_ISSUED: { tone: "violet", dot: "bg-violet-500" },
  HUMAN_APPROVED: { tone: "amber", dot: "bg-amber-500" },
  AUTH_AUTHORIZED: { tone: "emerald", dot: "bg-emerald-500" },
  AUTH_DECLINED: { tone: "rose", dot: "bg-rose-500" },
  CLAWBACK: { tone: "teal", dot: "bg-teal-500" },
  MANDATE_INVALID: { tone: "rose", dot: "bg-rose-500" },
  MANDATE_TAMPERED: { tone: "rose", dot: "bg-rose-500" },
  MANDATE_RESEALED: { tone: "emerald", dot: "bg-emerald-500" },
  POLICY_UPDATED: { tone: "indigo", dot: "bg-indigo-500" },
  DELEGATED: { tone: "violet", dot: "bg-violet-500" },
  MANDATE_REVOKED: { tone: "rose", dot: "bg-rose-500" },
  PAYOUT_SENT: { tone: "teal", dot: "bg-teal-500" },
};
