/**
 * Deterministic mandate engine — the trust core of Comptroller.
 *
 * Given a funding request, the agent's policy, and how much it has already spent
 * today, decide whether money may move. Pure function, no side effects, fully
 * testable. This is the final authority — never the LLM.
 */

import { formatMoney } from "../money";
import type {
  AgentPolicy,
  FundRequest,
  MandateCheck,
  MandateDecision,
  ScopedControls,
} from "./types";

function scopeFor(req: FundRequest): ScopedControls {
  return {
    allowedCurrencies: [req.currency],
    allowedMerchantCategories: req.merchantCategory ? [req.merchantCategory] : [],
    // Card is scoped to exactly the approved amount — just-in-time funding.
    perTransactionCapMinor: req.amountMinor,
    singleUse: true,
  };
}

export function evaluateMandate(
  req: FundRequest,
  policy: AgentPolicy,
  spentTodayMinor: number,
): MandateDecision {
  const checks: MandateCheck[] = [];

  // 1. Currency must be allowed.
  const currencyOk = policy.allowedCurrencies.includes(req.currency);
  checks.push({
    name: "currency",
    passed: currencyOk,
    detail: currencyOk
      ? `${req.currency} is allowed`
      : `${req.currency} not in [${policy.allowedCurrencies.join(", ")}]`,
  });

  // 2. Merchant category must be allowed (if the agent restricts MCCs).
  const mccOk =
    !req.merchantCategory ||
    policy.allowedMerchantCategories.length === 0 ||
    policy.allowedMerchantCategories.includes(req.merchantCategory);
  checks.push({
    name: "merchant_category",
    passed: mccOk,
    detail: req.merchantCategory
      ? mccOk
        ? `MCC ${req.merchantCategory} is allowed`
        : `MCC ${req.merchantCategory} not in [${policy.allowedMerchantCategories.join(", ")}]`
      : "no merchant category specified",
  });

  // 3. Per-task cap.
  const perTaskOk = req.amountMinor <= policy.perTaskCapMinor;
  checks.push({
    name: "per_task_cap",
    passed: perTaskOk,
    detail: `${formatMoney(req.amountMinor, req.currency)} vs cap ${formatMoney(policy.perTaskCapMinor, policy.baseCurrency)}`,
  });

  // 4. Daily cap (cumulative).
  const dailyOk = spentTodayMinor + req.amountMinor <= policy.dailyCapMinor;
  checks.push({
    name: "daily_cap",
    passed: dailyOk,
    detail: `${formatMoney(spentTodayMinor, policy.baseCurrency)} + ${formatMoney(req.amountMinor, req.currency)} vs daily ${formatMoney(policy.dailyCapMinor, policy.baseCurrency)}`,
  });

  // Any hard failure → DENY (a real scope/limit violation).
  const firstFail = checks.find((c) => !c.passed);
  if (firstFail) {
    return {
      decision: "DENY",
      requiresHuman: false,
      reason: `Denied — ${firstFail.name.replace(/_/g, " ")} check failed: ${firstFail.detail}`,
      checks,
    };
  }

  // Within mandate but above the auto-approve threshold → human in the loop.
  if (req.amountMinor > policy.autoApproveThresholdMinor) {
    return {
      decision: "NEEDS_HUMAN",
      requiresHuman: true,
      reason: `${formatMoney(req.amountMinor, req.currency)} exceeds auto-approve threshold ${formatMoney(policy.autoApproveThresholdMinor, policy.baseCurrency)} — human approval required`,
      checks,
      scopedControls: scopeFor(req),
    };
  }

  // Fully within mandate → auto-approve.
  return {
    decision: "AUTO_APPROVE",
    requiresHuman: false,
    reason: `Within mandate — auto-approved for ${formatMoney(req.amountMinor, req.currency)}`,
    checks,
    scopedControls: scopeFor(req),
  };
}
