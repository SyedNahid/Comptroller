/**
 * Process-wide singletons for the web app. Next.js dev reloads modules, so we
 * cache on globalThis to keep one Ledger + Comptroller across requests/HMR.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Ledger } from "../ledger/store";
import { Comptroller } from "./service";
import { StubCardIssuer, AirwallexCardIssuer, type CardIssuer } from "./issuer";
import { airwallexFromEnv } from "../airwallex/client";
import { SEED_AGENTS } from "../agents/seed";
import {
  generateOperatorKeypair,
  signMandate,
  fingerprint,
  type OperatorKeypair,
  type MandateDoc,
} from "../mandate/signing";

interface Singletons {
  ledger: Ledger;
  comptroller: Comptroller;
  issuingKind: "stub" | "live";
  operator: OperatorKeypair;
  operatorFingerprint: string;
}

const g = globalThis as unknown as { __comptroller?: Singletons };
const KEY_PATH = ".data/operator.json";

/** Build a freshly-signed mandate for a seed agent. */
function sealMandate(agentId: string, privateKeyPem: string) {
  const a = SEED_AGENTS.find((s) => s.agentId === agentId);
  if (!a) return;
  const now = new Date();
  const expires = new Date(now.getTime() + 365 * 24 * 3600 * 1000);
  const doc: MandateDoc = {
    agentId: a.agentId,
    constraints: {
      perTaskCapMinor: a.perTaskCapMinor,
      dailyCapMinor: a.dailyCapMinor,
      autoApproveThresholdMinor: a.autoApproveThresholdMinor,
      allowedCurrencies: a.allowedCurrencies,
      allowedMerchantCategories: a.allowedMerchantCategories,
    },
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    nonce: randomUUID(),
  };
  return { doc, signed: signMandate(doc, privateKeyPem), at: now.toISOString() };
}

/** Re-sign every seed agent's mandate (restores integrity after a tamper demo). */
export function resealMandates() {
  const { ledger, operator } = getComptroller();
  for (const a of SEED_AGENTS) {
    const m = sealMandate(a.agentId, operator.privateKeyPem);
    if (m) ledger.upsertMandate(a.agentId, m.signed, m.at);
  }
}

function loadOrCreateOperatorKeys(): OperatorKeypair {
  if (existsSync(KEY_PATH)) {
    return JSON.parse(readFileSync(KEY_PATH, "utf8")) as OperatorKeypair;
  }
  const kp = generateOperatorKeypair();
  writeFileSync(KEY_PATH, JSON.stringify(kp), { mode: 0o600 });
  return kp;
}

export function getComptroller(): Singletons {
  if (g.__comptroller) return g.__comptroller;

  mkdirSync(".data", { recursive: true });
  const ledger = new Ledger(".data/comptroller.db");

  // Seed the fleet once.
  if (ledger.getAgents().length === 0) {
    for (const a of SEED_AGENTS) ledger.upsertAgent(a);
  }

  // Operator keypair + signed mandates (sign each agent's policy once).
  const operator = loadOrCreateOperatorKeys();
  if (ledger.countMandates() === 0) {
    for (const a of SEED_AGENTS) {
      const m = sealMandate(a.agentId, operator.privateKeyPem);
      if (m) ledger.upsertMandate(a.agentId, m.signed, m.at);
    }
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
    operatorPublicKeyPem: operator.publicKeyPem,
  });

  g.__comptroller = {
    ledger,
    comptroller,
    issuingKind: issuer.kind,
    operator,
    operatorFingerprint: fingerprint(operator.publicKeyPem),
  };
  return g.__comptroller;
}
