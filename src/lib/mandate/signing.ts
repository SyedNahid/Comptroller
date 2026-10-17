/**
 * Signed mandates (Ed25519) — verifiable agent authority.
 *
 * A human operator signs a mandate that bounds an agent's spending. Comptroller
 * verifies the signature (and expiry) before moving any money. This mirrors the
 * agentic-payments standards direction (Google AP2 "mandates", Visa Trusted Agent):
 * authority is a tamper-evident, cryptographically signed artifact — not a row an
 * attacker can quietly edit.
 *
 * Uses Node's built-in Ed25519 (node:crypto) — no dependencies.
 */

import {
  createPublicKey,
  createPrivateKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  createHash,
  type KeyObject,
} from "node:crypto";

export interface MandateConstraints {
  perTaskCapMinor: number;
  dailyCapMinor: number;
  autoApproveThresholdMinor: number;
  allowedCurrencies: string[];
  allowedMerchantCategories: string[];
}

export interface MandateDoc {
  agentId: string;
  constraints: MandateConstraints;
  issuedAt: string; // ISO
  expiresAt: string; // ISO
  nonce: string;
}

export interface SignedMandate {
  doc: MandateDoc;
  signature: string; // base64
  alg: "Ed25519";
}

export interface OperatorKeypair {
  publicKeyPem: string;
  privateKeyPem: string;
}

/** Deterministic JSON (sorted keys) so signing/verification is stable. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

export function generateOperatorKeypair(): OperatorKeypair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

/** Short, human-readable fingerprint of the operator public key. */
export function fingerprint(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  const hash = createHash("sha256").update(der).digest("hex");
  return hash.slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}

export function signMandate(doc: MandateDoc, privateKeyPem: string): SignedMandate {
  const key: KeyObject = createPrivateKey(privateKeyPem);
  const sig = cryptoSign(null, Buffer.from(canonical(doc)), key);
  return { doc, signature: sig.toString("base64"), alg: "Ed25519" };
}

export function verifyMandate(
  sm: SignedMandate,
  publicKeyPem: string,
  now = new Date(),
): { valid: boolean; reason: string } {
  try {
    const key = createPublicKey(publicKeyPem);
    const ok = cryptoVerify(null, Buffer.from(canonical(sm.doc)), key, Buffer.from(sm.signature, "base64"));
    if (!ok) return { valid: false, reason: "signature mismatch (mandate tampered)" };
    if (new Date(sm.doc.expiresAt) < now) return { valid: false, reason: "mandate expired" };
    if (new Date(sm.doc.issuedAt) > now) return { valid: false, reason: "mandate not yet valid" };
    return { valid: true, reason: "signature valid" };
  } catch (e) {
    return { valid: false, reason: `verification error: ${String(e)}` };
  }
}
