/**
 * Spike: real payouts (beneficiary + transfer) against the Airwallex sandbox.
 * Works today without card issuing — undeniable money movement.
 *
 * Run:  npm run spike:payouts
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { airwallexFromEnv, AirwallexError } from "../src/lib/airwallex/client";

function log(step: string, data: unknown) {
  console.log(`\n=== ${step} ===`);
  console.dir(data, { depth: 8, colors: true });
}
function show(step: string, e: unknown) {
  console.error(`\nXXX ${step}`);
  if (e instanceof AirwallexError) {
    console.error("status", e.status);
    console.dir(e.body, { depth: 8, colors: true });
  } else console.error(e);
}

async function main() {
  const ax = airwallexFromEnv();

  // 1. Learn the beneficiary schema for a US/USD ACH (LOCAL) company payout.
  try {
    const schema = await ax.generateBeneficiarySchema({
      account_currency: "USD",
      bank_country_code: "US",
      entity_type: "COMPANY",
      transfer_method: "LOCAL",
      local_clearing_system: "ACH",
    });
    log("1. BENEFICIARY SCHEMA (fields)", schema);
  } catch (e) {
    show("1. SCHEMA failed", e);
  }

  // 2. Attempt a transfer with an inline beneficiary (iterate on errors).
  try {
    const transfer = await ax.createTransfer({
      request_id: randomUUID(),
      source_currency: "USD",
      transfer_currency: "USD",
      transfer_amount: 25,
      transfer_method: "LOCAL",
      reason: "goods",
      reference: "Comptroller supplier payout",
      transfer_date: new Date().toISOString().slice(0, 10),
      beneficiary: {
        entity_type: "COMPANY",
        company_name: "Acme Supplies LLC",
        address: {
          country_code: "US",
          city: "San Francisco",
          state: "CA",
          postcode: "94102",
          street_address: "1 Market St",
        },
        bank_details: {
          account_currency: "USD",
          account_name: "Acme Supplies LLC",
          account_number: "123456789",
          bank_country_code: "US",
          local_clearing_system: "ACH",
          account_routing_type1: "aba",
          account_routing_value1: "021000021",
        },
      },
    });
    log("2. TRANSFER CREATED", transfer);

    const t = transfer as { id?: string; status?: string };
    if (t.id) {
      // 3. Push to a terminal state in sandbox.
      const transitioned = await ax.transitionTransfer(t.id, "SETTLED");
      log("3. TRANSFER TRANSITIONED", transitioned);
    }
  } catch (e) {
    show("2/3. TRANSFER failed", e);
  }
}

main();
