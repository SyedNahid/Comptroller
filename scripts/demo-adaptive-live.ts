/**
 * Adaptive Loop — live integration against the real Comptroller service.
 *
 * Drives actual fund requests through the service (ledger + risk engine + governor
 * + circuit breaker) and prints the agent's risk state after each one, proving the
 * loop closes end-to-end: a burst of suspicious requests tightens the mandate, then
 * trips the breaker, after which every further request is refused at the frozen gate.
 *
 * Uses an isolated temp DB and the stub card issuer — all USD, so no network calls.
 *
 * Run:  npm run demo:adaptive:live
 */

import { existsSync, rmSync } from "node:fs";
import { Ledger } from "../src/lib/ledger/store";
import { Comptroller } from "../src/lib/comptroller/service";
import { StubCardIssuer } from "../src/lib/comptroller/issuer";
import type { AirwallexClient } from "../src/lib/airwallex/client";
import { SEED_AGENTS } from "../src/lib/agents/seed";
import { toMinor } from "../src/lib/money";

// USD-only flow makes no FX/transfer calls, so a no-op client keeps this offline.
const noopAx = {
  createConversion: async () => ({}),
  createTransfer: async () => ({}),
} as unknown as AirwallexClient;

const DB = ".data/adaptive-test.db";
for (const suffix of ["", "-wal", "-shm"]) {
  if (existsSync(DB + suffix)) rmSync(DB + suffix);
}

const ledger = new Ledger(DB);
const agent = SEED_AGENTS.find((a) => a.agentId === "ad-buyer")!;
ledger.upsertAgent(agent);

// No operator key → skip signature verification; no reseal hook needed. We're
// isolating the adaptive loop (risk → govern → freeze), not the crypto path.
const comptroller = new Comptroller(ledger, noopAx, new StubCardIssuer(), {
  treasuryReserveCurrency: "USD",
});

const day = new Date().toISOString().slice(0, 10);
const base = Date.parse(`${day}T10:00:00.000Z`);
const at = (i: number) => new Date(base + i * 15_000).toISOString(); // 15s apart

// A plausible attack arc: a few normal buys establish a baseline, then behavior
// shifts into a rapid burst of off-mandate probing across new merchant categories
// — all inside the 5-minute velocity window.
const reqs = [
  { amt: 40, mcc: "7311", note: "normal ad buy" },
  { amt: 50, mcc: "7311", note: "normal ad buy" },
  { amt: 60, mcc: "7311", note: "normal ad buy" },
  { amt: 120, mcc: "7995", note: "off-mandate (gambling)" },
  { amt: 150, mcc: "5812", note: "off-mandate (restaurants)" },
  { amt: 180, mcc: "6051", note: "off-mandate (crypto)" },
  { amt: 50, mcc: "7311", note: "post-freeze attempt" },
];

const pad = (s: string, n: number) => s.padEnd(n);

async function main() {
  console.log("Agent: ad-buyer  (per-task $500, daily $1000, auto-approve $500, MCC 7311)\n");
  console.log(
    pad("#", 3) + pad("request", 34) + pad("decision", 14) + "risk → band / action (frozen, trust)",
  );
  console.log("─".repeat(104));

  for (let i = 0; i < reqs.length; i++) {
    const r = reqs[i];
    const res = await comptroller.fundRequest(
      {
        agentId: agent.agentId,
        task: r.note,
        amountMinor: toMinor(r.amt),
        currency: "USD",
        merchantCategory: r.mcc,
      },
      at(i),
    );
    const rs = ledger.getRiskState(agent.agentId);
    const label = `$${r.amt} ${r.mcc} (${r.note})`;
    const risk = rs
      ? `${String(rs.score).padStart(3)} → ${pad(rs.band, 9)} ${pad(rs.action, 9)} frozen=${rs.frozen} trust=${rs.trust}`
      : "—";
    console.log(pad(`${i + 1}`, 3) + pad(label, 34) + pad(res.decision, 14) + risk);
  }

  // Show the current (possibly tightened) policy + the operator clearing the breaker.
  const tightened = ledger.getPolicy(agent.agentId)!;
  console.log(
    `\nPolicy now: per-task $${tightened.perTaskCapMinor / 100}, auto-approve $${tightened.autoApproveThresholdMinor / 100} (started $500 / $500).`,
  );

  console.log("\nOperator clears the circuit breaker…");
  comptroller.clearFreeze(agent.agentId, at(reqs.length));

  // The breaker is cleared, but the tightened mandate PERSISTS: an over-cap buy is
  // still denied, while a modest in-mandate buy resumes cleanly.
  const overCap = await comptroller.fundRequest(
    { agentId: agent.agentId, task: "post-clear over tightened cap", amountMinor: toMinor(300), currency: "USD", merchantCategory: "7311" },
    at(reqs.length + 1),
  );
  console.log(`Post-clear $300 7311 (over tightened cap) → ${overCap.decision}`);
  const resume = await comptroller.fundRequest(
    { agentId: agent.agentId, task: "resume", amountMinor: toMinor(50), currency: "USD", merchantCategory: "7311" },
    at(reqs.length + 2),
  );
  console.log(`Post-clear $50 7311 (in mandate) → ${resume.decision} (${resume.status})`);

  ledger.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(DB + suffix)) rmSync(DB + suffix);
  }
}

main();
