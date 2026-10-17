/**
 * Demo: mandate engine + ledger end-to-end (no Airwallex issuing needed).
 *
 * Seeds the fleet, runs a series of funding requests through the deterministic
 * mandate engine, persists every decision + audit entry, and prints the result —
 * including the "live decline" and "needs human approval" moments.
 *
 * Run:  npm run demo:mandate
 */

import { Ledger, today } from "../src/lib/ledger/store";
import { evaluateMandate } from "../src/lib/mandate/engine";
import { SEED_AGENTS } from "../src/lib/agents/seed";
import { toMinor, formatMoney } from "../src/lib/money";
import type { FundRequest } from "../src/lib/mandate/types";

// In-memory DB for a clean, deterministic demo run.
const ledger = new Ledger(":memory:");
for (const a of SEED_AGENTS) ledger.upsertAgent(a);

const NOW = "2026-10-17T12:00:00.000Z";

const scenarios: Array<{ label: string; req: FundRequest }> = [
  {
    label: "Ad-buyer buys $400 of Meta ads (in-policy)",
    req: { agentId: "ad-buyer", task: "Meta ads campaign", amountMinor: toMinor(400), currency: "USD", merchantCategory: "7311", merchantName: "Meta" },
  },
  {
    label: "Ad-buyer tries $900 (over per-task cap) → DENY",
    req: { agentId: "ad-buyer", task: "Big ad spend", amountMinor: toMinor(900), currency: "USD", merchantCategory: "7311", merchantName: "Meta" },
  },
  {
    label: "Ad-buyer tries $120 at a restaurant (off-mandate MCC) → DENY",
    req: { agentId: "ad-buyer", task: "Team lunch (!)", amountMinor: toMinor(120), currency: "USD", merchantCategory: "5812", merchantName: "Nobu" },
  },
  {
    label: "SaaS agent needs €350 (above €200 threshold) → NEEDS_HUMAN",
    req: { agentId: "saas-procurement", task: "Figma seats", amountMinor: toMinor(350), currency: "EUR", merchantCategory: "5734", merchantName: "Figma" },
  },
  {
    label: "Data-vendor buys £250 dataset (in-policy)",
    req: { agentId: "data-vendor", task: "Market dataset", amountMinor: toMinor(250), currency: "GBP", merchantCategory: "7375", merchantName: "DataCo" },
  },
];

const ICON = { AUTO_APPROVE: "✅", NEEDS_HUMAN: "✋", DENY: "⛔" } as const;

for (const { label, req } of scenarios) {
  const policy = ledger.getPolicy(req.agentId)!;
  const spentToday = ledger.getSpentTodayMinor(req.agentId, req.currency, today(new Date(NOW)));
  const result = evaluateMandate(req, policy, spentToday);

  const status =
    result.decision === "AUTO_APPROVE"
      ? "APPROVED"
      : result.decision === "NEEDS_HUMAN"
        ? "PENDING_APPROVAL"
        : "DENIED";

  const frId = ledger.createFundRequest({
    agentId: req.agentId,
    task: req.task,
    amountMinor: req.amountMinor,
    currency: req.currency,
    merchantCategory: req.merchantCategory,
    merchantName: req.merchantName,
    decision: result.decision,
    status,
    reason: result.reason,
    createdAt: NOW,
  });

  ledger.appendAudit({
    ts: NOW,
    agentId: req.agentId,
    fundRequestId: frId,
    type: `MANDATE_${result.decision}`,
    message: result.reason,
    data: { checks: result.checks, scopedControls: result.scopedControls },
  });

  console.log(`\n${ICON[result.decision]} ${label}`);
  console.log(`   ${formatMoney(req.amountMinor, req.currency)} · ${result.decision} — ${result.reason}`);
  for (const c of result.checks) {
    console.log(`     ${c.passed ? "·" : "✗"} ${c.name}: ${c.detail}`);
  }
}

console.log("\n--- Audit log (most recent first) ---");
for (const row of ledger.getAuditLog()) {
  console.log(`[${row.ts}] ${row.type} — ${row.message}`);
}

ledger.close();
console.log("\nMandate + ledger demo complete.");
