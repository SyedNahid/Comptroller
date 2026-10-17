/**
 * Process-wide singletons for the web app. Next.js dev reloads modules, so we
 * cache on globalThis to keep one Ledger + Comptroller across requests/HMR.
 */

import { mkdirSync } from "node:fs";
import { Ledger } from "../ledger/store";
import { Comptroller } from "./service";
import { StubCardIssuer, AirwallexCardIssuer, type CardIssuer } from "./issuer";
import { airwallexFromEnv } from "../airwallex/client";
import { SEED_AGENTS } from "../agents/seed";

interface Singletons {
  ledger: Ledger;
  comptroller: Comptroller;
  issuingKind: "stub" | "live";
}

const g = globalThis as unknown as { __comptroller?: Singletons };

export function getComptroller(): Singletons {
  if (g.__comptroller) return g.__comptroller;

  mkdirSync(".data", { recursive: true });
  const ledger = new Ledger(".data/comptroller.db");

  // Seed the fleet once.
  if (ledger.getAgents().length === 0) {
    for (const a of SEED_AGENTS) ledger.upsertAgent(a);
  }

  const ax = airwallexFromEnv();

  // Stub issuing until the sandbox issuing program is enabled. Flip via
  // COMPTROLLER_ISSUING=live once AirwallexCardIssuer has a cardholder id.
  let issuer: CardIssuer;
  if (process.env.COMPTROLLER_ISSUING === "live" && process.env.AIRWALLEX_CARDHOLDER_ID) {
    issuer = new AirwallexCardIssuer(ax, process.env.AIRWALLEX_CARDHOLDER_ID);
  } else {
    issuer = new StubCardIssuer();
  }

  const comptroller = new Comptroller(ledger, ax, issuer, {
    treasuryReserveCurrency: process.env.COMPTROLLER_RESERVE ?? "USD",
  });

  g.__comptroller = { ledger, comptroller, issuingKind: issuer.kind };
  return g.__comptroller;
}
