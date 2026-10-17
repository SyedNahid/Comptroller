/**
 * End-to-end demo: the full Comptroller loop.
 *
 * mandate -> live Airwallex FX conversion (USD reserve -> agent currency) ->
 * scoped single-use card (stub until issuing is enabled) -> spend + authorize ->
 * clawback + reconcile -> audit. Uses the REAL sandbox for FX.
 *
 * Run:  npm run demo:e2e   (needs .env with sandbox creds)
 */

import "dotenv/config";
import { Ledger } from "../src/lib/ledger/store";
import { Comptroller } from "../src/lib/comptroller/service";
import { StubCardIssuer } from "../src/lib/comptroller/issuer";
import { airwallexFromEnv } from "../src/lib/airwallex/client";
import { SEED_AGENTS } from "../src/lib/agents/seed";
import { toMinor, formatMoney } from "../src/lib/money";
import type { FundRequest } from "../src/lib/mandate/types";

const ICON: Record<string, string> = {
  AUTO_APPROVE: "✅",
  NEEDS_HUMAN: "✋",
  DENY: "⛔",
};

async function main() {
  const ledger = new Ledger(":memory:");
  for (const a of SEED_AGENTS) ledger.upsertAgent(a);

  const ax = airwallexFromEnv();
  const issuer = new StubCardIssuer();
  const comptroller = new Comptroller(ledger, ax, issuer, {
    treasuryReserveCurrency: "USD",
  });

  const reqs: Array<{ label: string; req: FundRequest }> = [
    {
      label: "Ad-buyer $400 Meta ads (USD, no FX)",
      req: { agentId: "ad-buyer", task: "Meta campaign", amountMinor: toMinor(400), currency: "USD", merchantCategory: "7311", merchantName: "Meta" },
    },
    {
      label: "SaaS €150 Figma (live USD→EUR FX)",
      req: { agentId: "saas-procurement", task: "Figma seats", amountMinor: toMinor(150), currency: "EUR", merchantCategory: "5734", merchantName: "Figma" },
    },
    {
      label: "Data-vendor £250 dataset (live USD→GBP FX)",
      req: { agentId: "data-vendor", task: "Market dataset", amountMinor: toMinor(250), currency: "GBP", merchantCategory: "7375", merchantName: "DataCo" },
    },
    {
      label: "Ad-buyer $900 (over cap)",
      req: { agentId: "ad-buyer", task: "Big spend", amountMinor: toMinor(900), currency: "USD", merchantCategory: "7311", merchantName: "Meta" },
    },
  ];

  const results = [];
  for (const { label, req } of reqs) {
    const r = await comptroller.fundRequest(req);
    results.push({ label, req, r });
    console.log(`\n${ICON[r.decision]} ${label}`);
    console.log(`   ${r.decision} — ${r.reason}`);
    if (r.conversion) {
      console.log(
        `   FX: sold ${formatMoney(r.conversion.sellAmountMinor, r.conversion.sellCurrency)} @ ${r.conversion.clientRate} · est. saved ${formatMoney(r.conversion.savedMinor, r.conversion.sellCurrency)}`,
      );
    }
    if (r.card) console.log(`   Card: ••${r.card.last4}${r.card.stub ? " (stub)" : ""}`);
  }

  // Human-in-the-loop: a request above the threshold.
  console.log("\n--- Human approval path ---");
  const human = await comptroller.fundRequest({
    agentId: "saas-procurement",
    task: "Notion enterprise",
    amountMinor: toMinor(350),
    currency: "EUR",
    merchantCategory: "7372",
    merchantName: "Notion",
  });
  console.log(`✋ SaaS €350 → ${human.decision} (${human.status})`);
  const approved = await comptroller.approveFundRequest(human.fundRequestId);
  console.log(`   After approval → ${approved.status}; card ••${approved.card?.last4}${approved.conversion ? `; saved ${formatMoney(approved.conversion.savedMinor, approved.conversion.sellCurrency)}` : ""}`);

  // Spend + authorize + clawback on the first (Meta) card.
  console.log("\n--- Spend, authorize, clawback ---");
  const meta = results[0].r;
  const auth1 = await comptroller.simulateSpend({ fundRequestId: meta.fundRequestId, spendMinor: toMinor(380), merchantCategory: "7311" });
  console.log(`   Spend $380 on Meta card → ${auth1.result} (${auth1.reason})`);

  // A decline: fund $100, then try to spend $150.
  const small = await comptroller.fundRequest({ agentId: "ad-buyer", task: "Small ad test", amountMinor: toMinor(100), currency: "USD", merchantCategory: "7311" });
  const auth2 = await comptroller.simulateSpend({ fundRequestId: small.fundRequestId, spendMinor: toMinor(150), merchantCategory: "7311" });
  console.log(`   Spend $150 on a $100 card → ${auth2.result} (${auth2.reason})`);

  console.log(`\n💰 Total estimated FX savings: ${formatMoney(ledger.totalSavedMinor(), "USD")}`);

  console.log("\n--- Audit log (recent first) ---");
  for (const row of ledger.getAuditLog(20)) {
    console.log(`[${row.type}] ${row.message}`);
  }

  ledger.close();
  console.log("\nE2E demo complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
