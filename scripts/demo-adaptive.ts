/**
 * Adaptive Loop demo (pure, no Airwallex needed).
 *
 * Replays an agent going from normal behavior to compromised, showing the risk
 * score climb and the governor's action change at each step:
 *   CALM → ELEVATED (flag) → HIGH (auto-tighten) → CRITICAL (circuit breaker).
 *
 * Run:  npm run demo:adaptive
 */

import { assessRisk, type RiskEvent } from "../src/lib/adaptive/risk";
import type { Decision } from "../src/lib/mandate/types";

const DAILY_CAP = 2_000_00; // $2,000
const BASE = Date.parse("2026-11-08T10:00:00.000Z");

/** Build an event N seconds after the base time. */
function ev(
  offsetSec: number,
  amountMajor: number,
  decision: Decision,
  mcc = "7311",
): RiskEvent {
  return {
    amountMinor: Math.round(amountMajor * 100),
    currency: "USD",
    merchantCategory: mcc,
    decision,
    createdAt: new Date(BASE + offsetSec * 1000).toISOString(),
  };
}

const bar = (score: number) =>
  "█".repeat(Math.round(score / 4)).padEnd(25, "·");

function show(stage: string, events: RiskEvent[], spentTodayMinor: number) {
  // "now" = 30s after the most recent event, so the window captures the burst.
  const latest = Math.max(...events.map((e) => Date.parse(e.createdAt)));
  const now = new Date(latest + 30_000).toISOString();
  const a = assessRisk({ now, events, dailyCapMinor: DAILY_CAP, spentTodayMinor });

  console.log(`\n── ${stage} ──`);
  console.log(`  score  ${String(a.score).padStart(3)} |${bar(a.score)}| ${a.band}`);
  console.log(`  action ${a.action}   ${a.summary}`);
  for (const f of a.factors) {
    console.log(`    • ${f.label} (+${f.points}) — ${f.detail}`);
  }
}

// A clean baseline of spaced-out, approved ad buys (well before any burst, so
// they inform the agent's "normal" without counting as velocity).
const baseline: RiskEvent[] = [
  ev(0, 60, "AUTO_APPROVE"),
  ev(600, 45, "AUTO_APPROVE"),
  ev(1200, 70, "AUTO_APPROVE"),
];

// Stage 1 — a normal morning. Nothing out of pattern.
show("Stage 1 · normal operation", baseline, 175_00);

// Stage 2 — behavior drifts: a rapid pair and one off-mandate rejection.
const elevated: RiskEvent[] = [
  ...baseline,
  ev(1800, 80, "AUTO_APPROVE"),
  ev(1830, 120, "DENY", "7995"), // off-mandate merchant (gambling)
];
show("Stage 2 · behavior drifts (FLAG)", elevated, 255_00);

// Stage 3 — compromised pattern: a 5-request burst, bigger amount, new MCCs,
// but only starting to probe the boundary. Lands in HIGH → governor TIGHTENS.
const high: RiskEvent[] = [
  ...baseline,
  ev(1700, 80, "AUTO_APPROVE", "7311"),
  ev(1760, 120, "AUTO_APPROVE", "7311"),
  ev(1820, 160, "DENY", "7995"), // one off-mandate probe
  ev(1850, 200, "AUTO_APPROVE", "5967"), // new category
  ev(1880, 250, "AUTO_APPROVE", "7311"),
];
show("Stage 3 · compromised pattern (TIGHTEN)", high, 900_00);

// Stage 4 — full attack: rapid-fire boundary probing, draining the cap.
const critical: RiskEvent[] = [
  ...high,
  ev(1890, 600, "DENY", "6051"), // crypto
  ev(1900, 600, "DENY", "7995"),
  ev(1910, 900, "DENY", "4829"), // wire/money transfer
];
show("Stage 4 · active exfiltration attempt (FREEZE)", critical, 1_850_00);

console.log(
  "\nGovernor response: FLAG → TIGHTEN (mandate re-signed, caps halved) → FREEZE (circuit breaker).",
);
console.log("Even fully compromised, the agent cannot move money past the frozen gate.\n");
