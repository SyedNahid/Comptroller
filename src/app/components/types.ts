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
export interface State {
  issuingKind: string;
  agents: AgentPolicy[];
  requests: FundRequestRow[];
  audit: AuditRow[];
  totalSavedMinor: number;
  balances: Balance[];
}

export const DECISION_STYLE: Record<string, string> = {
  AUTO_APPROVE: "text-emerald-400",
  NEEDS_HUMAN: "text-amber-400",
  DENY: "text-rose-400",
};
export const AUDIT_STYLE: Record<string, string> = {
  MANDATE_AUTO_APPROVE: "text-emerald-400",
  MANDATE_NEEDS_HUMAN: "text-amber-400",
  MANDATE_DENY: "text-rose-400",
  FX_CONVERTED: "text-sky-400",
  CARD_ISSUED: "text-violet-400",
  HUMAN_APPROVED: "text-amber-300",
  AUTH_AUTHORIZED: "text-emerald-400",
  AUTH_DECLINED: "text-rose-400",
  CLAWBACK: "text-teal-400",
};
