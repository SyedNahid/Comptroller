/**
 * Mandate engine types.
 *
 * The mandate engine is the DETERMINISTIC source of truth for whether money may
 * move. The LLM may propose a funding request, but this engine — not the model —
 * decides AUTO_APPROVE / NEEDS_HUMAN / DENY.
 */

export type Decision = "AUTO_APPROVE" | "NEEDS_HUMAN" | "DENY";

/** Per-agent spending policy (its "mandate"). Amounts in minor units. */
export interface AgentPolicy {
  agentId: string;
  displayName: string;
  /** Currency the treasury funds this agent from (for FX decisions). */
  baseCurrency: string;
  /** Currencies the agent is allowed to spend in. */
  allowedCurrencies: string[];
  /** Allowed merchant category codes (MCC). Empty = any. */
  allowedMerchantCategories: string[];
  /** Max for a single request. */
  perTaskCapMinor: number;
  /** Max cumulative spend per day. */
  dailyCapMinor: number;
  /** At or below this, auto-approve; above it, require human approval. */
  autoApproveThresholdMinor: number;
}

/** A request from an agent to be funded for a task. */
export interface FundRequest {
  agentId: string;
  task: string;
  amountMinor: number;
  currency: string;
  /** MCC the spend will target (enables merchant-scoping + decline). */
  merchantCategory?: string;
  merchantName?: string;
}

export interface MandateCheck {
  name: string;
  passed: boolean;
  detail: string;
}

/** The card scope the treasury will apply if the request proceeds. */
export interface ScopedControls {
  allowedCurrencies: string[];
  allowedMerchantCategories: string[];
  perTransactionCapMinor: number;
  singleUse: boolean;
}

export interface MandateDecision {
  decision: Decision;
  requiresHuman: boolean;
  reason: string;
  checks: MandateCheck[];
  /** Present when the request is AUTO_APPROVE or NEEDS_HUMAN (not DENY). */
  scopedControls?: ScopedControls;
}
