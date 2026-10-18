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
import type { AgentPolicy } from "../mandate/types";
import {
  generateOperatorKeypair,
  signMandate,
  deriveSubMandate,
  fingerprint,
  type OperatorKeypair,
  type MandateDoc,
  type MandateConstraints,
  type SignedMandate,
} from "../mandate/signing";

type Keyring = Record<string, OperatorKeypair>;

interface Singletons {
  ledger: Ledger;
  comptroller: Comptroller;
  issuingKind: "stub" | "live";
  operator: OperatorKeypair;
  operatorFingerprint: string;
  agentKeys: Keyring;
}

const g = globalThis as unknown as { __comptroller?: Singletons };
const KEY_PATH = ".data/operator.json";
const AGENT_KEYS_PATH = ".data/agent-keys.json";

function loadJson<T>(path: string, make: () => T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as T;
  const v = make();
  writeFileSync(path, JSON.stringify(v), { mode: 0o600 });
  return v;
}

function saveAgentKeys(keys: Keyring) {
  writeFileSync(AGENT_KEYS_PATH, JSON.stringify(keys), { mode: 0o600 });
}

/** Ensure every agent id has a keypair (so it can sign sub-mandates). */
function ensureAgentKey(keys: Keyring, agentId: string): OperatorKeypair {
  if (!keys[agentId]) {
    keys[agentId] = generateOperatorKeypair();
    saveAgentKeys(keys);
  }
  return keys[agentId];
}

/** Root mandate: operator signs, embedding the agent's own public key. */
function sealRoot(
  policy: AgentPolicy,
  operator: OperatorKeypair,
  agentPublicKeyPem: string,
): { signed: SignedMandate; at: string } {
  const now = new Date();
  const expires = new Date(now.getTime() + 365 * 24 * 3600 * 1000);
  const doc: MandateDoc = {
    agentId: policy.agentId,
    constraints: {
      perTaskCapMinor: policy.perTaskCapMinor,
      dailyCapMinor: policy.dailyCapMinor,
      autoApproveThresholdMinor: policy.autoApproveThresholdMinor,
      allowedCurrencies: policy.allowedCurrencies,
      allowedMerchantCategories: policy.allowedMerchantCategories,
    },
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    nonce: randomUUID(),
    subjectPublicKeyPem: agentPublicKeyPem,
    issuer: "operator",
  };
  return { signed: signMandate(doc, operator.privateKeyPem, operator.publicKeyPem), at: now.toISOString() };
}

/** Re-sign all ROOT (operator-issued) mandates from current policy. */
export function resealMandates() {
  const { ledger, operator, agentKeys } = getComptroller();
  for (const p of ledger.getAgents()) {
    const sm = ledger.getMandate<SignedMandate>(p.agentId);
    if (sm && (sm.doc.issuer ?? "operator") !== "operator") continue; // don't reseal delegated
    const kp = ensureAgentKey(agentKeys, p.agentId);
    const m = sealRoot(p, operator, kp.publicKeyPem);
    ledger.upsertMandate(p.agentId, m.signed, m.at);
  }
}

/** Re-sign a single root agent's mandate (after a policy update). */
export function sealAgentMandate(agentId: string) {
  const { ledger, operator, agentKeys } = getComptroller();
  const p = ledger.getPolicy(agentId);
  if (!p) return;
  const kp = ensureAgentKey(agentKeys, agentId);
  const m = sealRoot(p, operator, kp.publicKeyPem);
  ledger.upsertMandate(agentId, m.signed, m.at);
}

/** Parent agent delegates an attenuated sub-budget to a new child agent. */
export function delegateBudget(input: {
  parentAgentId: string;
  childAgentId: string;
  constraints: MandateConstraints;
}): AgentPolicy {
  const { ledger, agentKeys } = getComptroller();
  const parentPolicy = ledger.getPolicy(input.parentAgentId);
  const parentSM = ledger.getMandate<SignedMandate>(input.parentAgentId);
  if (!parentPolicy || !parentSM) throw new Error(`Unknown parent agent ${input.parentAgentId}`);
  const parentKp = agentKeys[input.parentAgentId];
  if (!parentKp) throw new Error(`Parent ${input.parentAgentId} has no signing key`);

  const childKp = ensureAgentKey(agentKeys, input.childAgentId);
  // Empty currency/MCC means "inherit parent's scope" (just a smaller budget).
  const constraints: MandateConstraints = {
    ...input.constraints,
    allowedCurrencies: input.constraints.allowedCurrencies.length
      ? input.constraints.allowedCurrencies
      : parentPolicy.allowedCurrencies,
    allowedMerchantCategories: input.constraints.allowedMerchantCategories.length
      ? input.constraints.allowedMerchantCategories
      : parentPolicy.allowedMerchantCategories,
  };
  // Throws if constraints are not a strict attenuation of the parent's.
  const childSM = deriveSubMandate({
    parent: parentSM,
    childAgentId: input.childAgentId,
    childConstraints: constraints,
    childSubjectPublicKeyPem: childKp.publicKeyPem,
    parentPrivateKeyPem: parentKp.privateKeyPem,
    nonce: randomUUID(),
  });

  const childPolicy: AgentPolicy = {
    agentId: input.childAgentId,
    displayName: input.childAgentId,
    baseCurrency: parentPolicy.baseCurrency,
    allowedCurrencies: constraints.allowedCurrencies,
    allowedMerchantCategories: constraints.allowedMerchantCategories,
    perTaskCapMinor: constraints.perTaskCapMinor,
    dailyCapMinor: constraints.dailyCapMinor,
    autoApproveThresholdMinor: constraints.autoApproveThresholdMinor,
  };
  const now = new Date().toISOString();
  ledger.upsertAgent(childPolicy);
  ledger.upsertMandate(input.childAgentId, childSM, now);
  ledger.appendAudit({
    ts: now,
    agentId: input.parentAgentId,
    type: "DELEGATED",
    message: `${input.parentAgentId} delegated a sub-mandate to ${input.childAgentId} (attenuated, signed)`,
  });
  return childPolicy;
}

/** Revoke an agent's mandate — cascades: any child chaining through it fails. */
export function revokeAgent(agentId: string) {
  const { ledger } = getComptroller();
  const sm = ledger.getMandate<SignedMandate>(agentId);
  if (!sm) return;
  ledger.revokeNonce(sm.doc.nonce);
  ledger.appendAudit({
    ts: new Date().toISOString(),
    agentId,
    type: "MANDATE_REVOKED",
    message: `Mandate for ${agentId} revoked — its sub-delegations are now void too`,
  });
}

export function getComptroller(): Singletons {
  if (g.__comptroller) return g.__comptroller;

  mkdirSync(".data", { recursive: true });
  const ledger = new Ledger(".data/comptroller.db");
  const operator = loadJson<OperatorKeypair>(KEY_PATH, generateOperatorKeypair);
  const agentKeys = loadJson<Keyring>(AGENT_KEYS_PATH, () => ({}));

  // Seed the fleet once.
  if (ledger.getAgents().length === 0) {
    for (const a of SEED_AGENTS) ledger.upsertAgent(a);
  }

  // Seed / migrate root mandates. Reseal if missing (fresh) OR lacking the
  // delegation fields (upgrade from the pre-delegation schema).
  const firstSeed = SEED_AGENTS[0];
  const existing = ledger.getMandate<SignedMandate>(firstSeed.agentId);
  const needsSeed = ledger.countMandates() === 0 || !existing?.doc.subjectPublicKeyPem;
  if (needsSeed) {
    for (const a of SEED_AGENTS) {
      const kp = ensureAgentKey(agentKeys, a.agentId);
      const m = sealRoot(a, operator, kp.publicKeyPem);
      ledger.upsertMandate(a.agentId, m.signed, m.at);
    }
  }

  const ax = airwallexFromEnv();
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
    agentKeys,
  };
  return g.__comptroller;
}
