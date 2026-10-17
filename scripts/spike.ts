/**
 * Week-0 de-risk spike.
 *
 * Validates the whole Airwallex stack against the sandbox, step by step, so we
 * know the rails work before building the product on top.
 *
 * Run:  npm run spike
 * Needs: .env.local with AIRWALLEX_CLIENT_ID / AIRWALLEX_API_KEY
 *
 * Each step is isolated and logs clearly; a failing step prints the error body
 * (Airwallex error payloads are descriptive) and stops.
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { airwallexFromEnv, AirwallexError } from "../src/lib/airwallex/client";

interface Balance {
  currency: string;
  available_amount: number;
  total_amount: number;
}

function log(step: string, data: unknown) {
  console.log(`\n=== ${step} ===`);
  console.dir(data, { depth: 6, colors: true });
}

function fail(step: string, err: unknown): never {
  console.error(`\nXXX ${step} FAILED`);
  if (err instanceof AirwallexError) {
    console.error(`status: ${err.status}`);
    console.dir(err.body, { depth: 6, colors: true });
  } else {
    console.error(err);
  }
  process.exit(1);
}

async function main() {
  const ax = airwallexFromEnv();

  // Step 1: authenticate
  try {
    const token = await ax.getToken();
    log("1. AUTH ok (token prefix)", token.slice(0, 12) + "…");
  } catch (e) {
    fail("1. AUTH", e);
  }

  // Step 2: balances — summarize only funded currencies
  let funded: Balance[] = [];
  try {
    const balances = (await ax.getBalances()) as Balance[];
    funded = balances
      .filter((b) => b.available_amount > 0)
      .sort((a, b) => b.available_amount - a.available_amount);
    log(
      "2. FUNDED BALANCES",
      funded.map((b) => `${b.currency}: ${b.available_amount}`),
    );
  } catch (e) {
    fail("2. BALANCES", e);
  }

  // Pick a funded sell currency and a different buy currency for the conversion.
  const sellCur = funded[0]?.currency ?? "USD";
  const buyCur = sellCur === "USD" ? "EUR" : "USD";

  // Step 3: indicative FX rate for the chosen pair
  try {
    const rate = await ax.getFxRate({
      buy_currency: buyCur,
      sell_currency: sellCur,
      sell_amount: 1000,
    });
    log(`3. FX RATE (${sellCur}->${buyCur})`, rate);
  } catch (e) {
    console.warn("\n(step 3 FX rate failed — continuing)");
    if (e instanceof AirwallexError) console.dir(e.body, { depth: 6 });
  }

  // Step 4: create a REAL conversion (sell a small amount of the funded currency)
  try {
    const conversion = await ax.createConversion({
      request_id: randomUUID(),
      buy_currency: buyCur,
      sell_currency: sellCur,
      sell_amount: 100,
      reason: "other",
      term_agreement: true,
    });
    log(`4. CONVERSION CREATED (${sellCur}->${buyCur})`, conversion);
  } catch (e) {
    fail("4. CONVERSION", e);
  }

  // Step 5: create a cardholder (iterate on field_required errors to learn schema)
  let cardholderId: string | undefined;
  try {
    const cardholder = (await ax.createCardholder({
      type: "INDIVIDUAL",
      email: `ada+${Date.now()}@example.com`,
      mobile_number: "+6588888888",
      individual: {
        name: { first_name: "Ada", last_name: "Lovelace" },
        date_of_birth: "1990-01-01",
        express_consent_obtained: "yes",
        address: {
          city: "Singapore",
          country: "SG",
          line1: "1 Raffles Place",
          postcode: "048616",
          state: "Singapore",
        },
      },
    })) as { cardholder_id?: string };
    cardholderId = cardholder.cardholder_id;
    log("5. CARDHOLDER CREATED", cardholder);
  } catch (e) {
    fail("5. CARDHOLDER", e);
  }

  // Step 6: issue a single-use scoped virtual card
  try {
    const card = await ax.createCard({
      request_id: randomUUID(),
      cardholder_id: cardholderId,
      created_by: "Comptroller",
      form_factor: "VIRTUAL",
      issue_to: "INDIVIDUAL",
      // Only GOOD_FUNDS_CREDIT passes type-validation on this account; it still
      // fails issuance ("Invalid issuance details") until Airwallex configures
      // the issuing program for the sandbox account. See docs/FIXES.md.
      type: "GOOD_FUNDS_CREDIT",
      is_personalized: false,
      purpose: "ONLINE_PURCHASING",
      authorization_controls: {
        allowed_currencies: ["USD"],
        allowed_transaction_count: "SINGLE",
        // Scope: single-use card capped at $100, Meta Ads merchant category only.
        allowed_merchant_categories: ["7311"],
        transaction_limits: {
          currency: "USD",
          limits: [{ amount: 100, interval: "ALL_TIME" }],
        },
      },
    });
    log("6. CARD ISSUED", card);
  } catch (e) {
    fail("6. CARD", e);
  }

  console.log("\nSpike: issuing proven. Next: simulate transaction + decline.");
}

main();
