/**
 * The governor — turns a risk assessment into an action on the agent's authority.
 *
 * This is what makes Comptroller *adaptive* rather than static: the mandate is not
 * a fixed wall, it moves. As an agent's behavior drifts, the governor tightens its
 * caps (and the operator re-signs the narrowed mandate); if behavior looks like an
 * active attack, it trips a circuit breaker and freezes the agent entirely. When an
 * agent behaves well over time, its trust score rises and caps relax back.
 *
 * Pure + deterministic. The service layer applies the plan (persist + re-sign).
 */

import type { AgentPolicy } from "../mandate/types";
import type { GovernorAction, RiskAssessment } from "./risk";

/** Caps never tighten below this floor, so a noisy agent isn't zeroed out. */
const MIN_PER_TASK_MINOR = 50_00;
const MIN_THRESHOLD_MINOR = 20_00;
/** Each TIGHTEN halves the discretionary caps. */
const TIGHTEN_FACTOR = 0.5;

export interface GovernorPlan {
  action: GovernorAction;
  /** True when the circuit breaker should trip (agent frozen). */
  freeze: boolean;
  /** A narrowed policy to persist + re-sign (present only for TIGHTEN). */
  tightenedPolicy?: AgentPolicy;
  /** Human-readable explanation for the audit log + UI. */
  note: string;
}

function tighten(policy: AgentPolicy): AgentPolicy {
  return {
    ...policy,
    perTaskCapMinor: Math.max(
      MIN_PER_TASK_MINOR,
      Math.round(policy.perTaskCapMinor * TIGHTEN_FACTOR),
    ),
    autoApproveThresholdMinor: Math.max(
      MIN_THRESHOLD_MINOR,
      Math.round(policy.autoApproveThresholdMinor * TIGHTEN_FACTOR),
    ),
  };
}

/**
 * Decide what to do about an agent given its current risk and policy.
 * The service is responsible for applying the result (persist, re-sign, freeze).
 */
export function planGovernance(
  assessment: RiskAssessment,
  policy: AgentPolicy,
): GovernorPlan {
  switch (assessment.action) {
    case "FREEZE":
      return {
        action: "FREEZE",
        freeze: true,
        note: `Circuit breaker tripped (risk ${assessment.score}/100, ${assessment.band}). Agent frozen — all spend denied until an operator clears it.`,
      };
    case "TIGHTEN": {
      const tightened = tighten(policy);
      const already =
        tightened.perTaskCapMinor === policy.perTaskCapMinor &&
        tightened.autoApproveThresholdMinor === policy.autoApproveThresholdMinor;
      return {
        action: "TIGHTEN",
        freeze: false,
        tightenedPolicy: already ? undefined : tightened,
        note: already
          ? `Risk ${assessment.score}/100 (HIGH) — caps already at floor, holding.`
          : `Risk ${assessment.score}/100 (HIGH) — per-task cap ${policy.perTaskCapMinor / 100} → ${tightened.perTaskCapMinor / 100}, auto-approve ${policy.autoApproveThresholdMinor / 100} → ${tightened.autoApproveThresholdMinor / 100}; mandate re-signed.`,
      };
    }
    case "FLAG":
      return {
        action: "FLAG",
        freeze: false,
        note: `Risk ${assessment.score}/100 (ELEVATED) — flagged for watch, no change to authority.`,
      };
    default:
      return {
        action: "NONE",
        freeze: false,
        note: `Risk ${assessment.score}/100 (CALM) — within normal pattern.`,
      };
  }
}

// ---- Trust score (the "agent credit score") --------------------------------

export const DEFAULT_TRUST = 50;
const TRUST_MIN = 0;
const TRUST_MAX = 100;

/** Trust needed before caps are allowed to relax back toward baseline. */
export const TRUST_RELAX_THRESHOLD = 75;

/**
 * Update an agent's trust from the outcome of an action. Good, in-pattern
 * behavior slowly earns trust; rejections and risk events burn it fast.
 */
export function updateTrust(
  prev: number,
  outcome: "clean_settle" | "approved" | "denied" | "tightened" | "frozen",
): number {
  const delta = {
    clean_settle: +5,
    approved: +2,
    denied: -10,
    tightened: -20,
    frozen: -40,
  }[outcome];
  return Math.max(TRUST_MIN, Math.min(TRUST_MAX, prev + delta));
}

/**
 * When an agent has earned enough trust and is calm, relax its caps one step back
 * toward the baseline (undo a prior tightening) — never exceeding baseline.
 */
export function relaxToward(
  current: AgentPolicy,
  baseline: AgentPolicy,
): AgentPolicy {
  const step = (cur: number, base: number) =>
    Math.min(base, Math.round(cur / TIGHTEN_FACTOR));
  return {
    ...current,
    perTaskCapMinor: step(current.perTaskCapMinor, baseline.perTaskCapMinor),
    autoApproveThresholdMinor: step(
      current.autoApproveThresholdMinor,
      baseline.autoApproveThresholdMinor,
    ),
  };
}
