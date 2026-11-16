/**
 * Spike: real payouts (beneficiary + transfer) against the Airwallex sandbox.
 * Probes which beneficiary corridors have a schema, then attempts a transfer.
 *
 * Run:  npm run spike:payouts
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { airwallexFromEnv, AirwallexError } from "../src/lib/airwallex/client";

const CORRIDORS: Array<Record<string, string>> = [
  { account_currency: "USD", bank_country_code: "US", entity_type: "COMPANY", payment_method: "LOCAL" },
  { account_currency: "USD", bank_country_code: "US", entity_type: "COMPANY", payment_method: "SWIFT" },
  { account_currency: "GBP", bank_country_code: "GB", entity_type: "COMPANY", payment_method: "LOCAL" },
  { account_currency: "EUR", bank_country_code: "DE", entity_type: "COMPANY", payment_method: "LOCAL" },
  { account_currency: "AUD", bank_country_code: "AU", entity_type: "COMPANY", payment_method: "LOCAL" },
  { account_currency: "CNY", bank_country_code: "CN", entity_type: "COMPANY", payment_method: "LOCAL" },
  { account_currency: "HKD", bank_country_code: "HK", entity_type: "COMPANY", payment_method: "LOCAL" },
  { account_currency: "SGD", bank_country_code: "SG", entity_type: "COMPANY", payment_method: "LOCAL" },
];

function fields(schema: unknown): string[] {
  // The schema is a nested form definition; pull out field names heuristically.
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === "object") {
      const o = n as Record<string, unknown>;
      if (typeof o.key === "string") out.push(o.key);
      if (typeof o.name === "string") out.push(o.name);
      Object.values(o).forEach(walk);
    }
  };
  walk(schema);
  return [...new Set(out)];
}

async function main() {
  const ax = airwallexFromEnv();

  let working: Record<string, string> | null = null;
  for (const c of CORRIDORS) {
    try {
      const schema = await ax.generateBeneficiarySchema(c as never);
      console.log(`✅ ${c.account_currency}/${c.bank_country_code}/${c.transfer_method} — schema found`);
      console.log("   fields:", fields(schema).slice(0, 30).join(", "));
      if (!working) working = c;
    } catch (e) {
      if (e instanceof AirwallexError) console.log(`·  ${c.account_currency}/${c.bank_country_code}/${c.transfer_method} — ${e.status} ${(e.body as { code?: string })?.code ?? ""}`);
    }
  }

  if (!working) {
    console.log("\nNo corridor schema found — check Beneficiaries scope / sandbox support.");
    return;
  }

  // Attempt a real US/ACH LOCAL transfer (verbatim doc shape; we hold USD).
  console.log(`\nAttempting US/ACH transfer…`);
  try {
    const transfer = await ax.createTransfer({
      request_id: randomUUID(),
      transfer_amount: "25",
      transfer_currency: "USD",
      transfer_method: "LOCAL",
      source_currency: "USD",
      reason: "travel",
      reference: "Comptroller supplier payout",
      transfer_date: new Date().toISOString().slice(0, 10),
      beneficiary: {
        entity_type: "COMPANY",
        company_name: "Acme Supplies LLC",
        address: {
          city: "Seattle",
          country_code: "US",
          postcode: "98104",
          state: "Washington",
          street_address: "412 5th Avenue",
        },
        bank_details: {
          account_currency: "USD",
          account_name: "Acme Supplies LLC",
          account_number: "50001121",
          account_routing_type1: "aba",
          account_routing_value1: "021000021",
          bank_country_code: "US",
          bank_account_category: "Checking",
          local_clearing_system: "ACH",
        },
      },
    });
    console.dir(transfer, { depth: 8, colors: true });
    const t = transfer as { id?: string };
    if (t.id) {
      const settled = await ax.transitionTransfer(t.id, "SETTLED");
      console.log("transitioned:");
      console.dir(settled, { depth: 6, colors: true });
    }
  } catch (e) {
    if (e instanceof AirwallexError) {
      console.error("transfer status", e.status);
      console.dir(e.body, { depth: 8, colors: true });
    } else console.error(e);
  }
}

main();
