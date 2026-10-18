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
  // --- delegation fields (optional; present on all mandates we mint) ---
  /** This agent's own public key — lets it delegate narrower sub-mandates. */
  subjectPublicKeyPem?: string;
  /** "operator" for a root mandate, else the delegating parent agentId. */
  issuer?: string;
  /** Nonce of the parent mandate this one was derived from (delegated only). */
  parentNonce?: string;
}

export interface SignedMandate {
  doc: MandateDoc;
  signature: string; // base64
  alg: "Ed25519";
  /** Public key that produced `signature` (operator key, or parent's subject key). */
  signerPublicKeyPem?: string;
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

export function signMandate(
  doc: MandateDoc,
  privateKeyPem: string,
  signerPublicKeyPem?: string,
): SignedMandate {
  const key: KeyObject = createPrivateKey(privateKeyPem);
  const sig = cryptoSign(null, Buffer.from(canonical(doc)), key);
  return { doc, signature: sig.toString("base64"), alg: "Ed25519", signerPublicKeyPem };
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

// ---------------------------------------------------------------------------
// Delegated mandates — cryptographic, budget-aware capability attenuation.
//
// A parent agent mints a NARROWER sub-mandate for a child agent, signed with the
// parent's own key. Authority forms a verifiable chain back to the operator root.
// Solves the #1 open agentic-payments problem: cascading delegation with a single
// oversight point (revoke a parent → the whole subtree is void).
// ---------------------------------------------------------------------------

/** Child constraints must be a subset of (⊆) the parent's — monotonic reduction. */
export function attenuates(
  child: MandateConstraints,
  parent: MandateConstraints,
): { ok: boolean; reason: string } {
  if (child.perTaskCapMinor > parent.perTaskCapMinor)
    return { ok: false, reason: "child per-task cap exceeds parent" };
  if (child.dailyCapMinor > parent.dailyCapMinor)
    return { ok: false, reason: "child daily cap exceeds parent" };
  if (child.autoApproveThresholdMinor > parent.autoApproveThresholdMinor)
    return { ok: false, reason: "child auto-approve threshold exceeds parent" };
  const curOk = child.allowedCurrencies.every((c) => parent.allowedCurrencies.includes(c));
  if (!curOk) return { ok: false, reason: "child currencies not a subset of parent" };
  const mccOk =
    parent.allowedMerchantCategories.length === 0 ||
    child.allowedMerchantCategories.every((m) => parent.allowedMerchantCategories.includes(m));
  if (!mccOk) return { ok: false, reason: "child merchant categories not a subset of parent" };
  return { ok: true, reason: "ok" };
}

/** Parent agent derives + signs an attenuated sub-mandate for a child agent. */
export function deriveSubMandate(params: {
  parent: SignedMandate;
  childAgentId: string;
  childConstraints: MandateConstraints;
  childSubjectPublicKeyPem: string;
  parentPrivateKeyPem: string;
  nonce: string;
  now?: Date;
}): SignedMandate {
  const { parent, childConstraints } = params;
  const att = attenuates(childConstraints, parent.doc.constraints);
  if (!att.ok) throw new Error(`Illegal delegation — ${att.reason}`);

  const now = params.now ?? new Date();
  // Child expiry cannot outlive the parent.
  const parentExp = new Date(parent.doc.expiresAt).getTime();
  const wantExp = now.getTime() + 24 * 3600 * 1000;
  const expiresAt = new Date(Math.min(parentExp, wantExp)).toISOString();

  const doc: MandateDoc = {
    agentId: params.childAgentId,
    constraints: childConstraints,
    issuedAt: now.toISOString(),
    expiresAt,
    nonce: params.nonce,
    subjectPublicKeyPem: params.childSubjectPublicKeyPem,
    issuer: parent.doc.agentId,
    parentNonce: parent.doc.nonce,
  };
  // Signed by the PARENT's subject key (proving the parent authorized it).
  return signMandate(doc, params.parentPrivateKeyPem, parent.doc.subjectPublicKeyPem);
}

/**
 * Verify a full delegation chain child → … → operator root.
 * - every hop's signature checks out with its recorded signer key
 * - each child is a strict attenuation of its parent
 * - the chain terminates at a mandate signed by the operator key
 * - no mandate in the chain is revoked or expired
 */
export function verifyChain(
  sm: SignedMandate,
  resolveParent: (agentId: string) => SignedMandate | undefined,
  operatorPublicKeyPem: string,
  isRevoked: (nonce: string) => boolean = () => false,
  now = new Date(),
): { valid: boolean; reason: string; depth: number; chain: string[] } {
  const chain: string[] = [];
  let cur: SignedMandate | undefined = sm;
  let depth = 0;

  while (cur) {
    chain.push(cur.doc.agentId);
    if (isRevoked(cur.doc.nonce)) return { valid: false, reason: `revoked mandate for ${cur.doc.agentId}`, depth, chain };

    const signerPub = cur.signerPublicKeyPem;
    if (!signerPub) return { valid: false, reason: `missing signer key for ${cur.doc.agentId}`, depth, chain };

    const base = verifyMandate(cur, signerPub, now);
    if (!base.valid) return { valid: false, reason: `${cur.doc.agentId}: ${base.reason}`, depth, chain };

    const isRoot = (cur.doc.issuer ?? "operator") === "operator";
    if (isRoot) {
      if (signerPub.trim() !== operatorPublicKeyPem.trim())
        return { valid: false, reason: "root not signed by operator key", depth, chain };
      return { valid: true, reason: "chain valid", depth, chain };
    }

    // Delegated: resolve parent, check signer == parent subject key + attenuation.
    const parent: SignedMandate | undefined = resolveParent(cur.doc.issuer!);
    if (!parent) return { valid: false, reason: `parent ${cur.doc.issuer} not found`, depth, chain };
    if ((parent.doc.subjectPublicKeyPem ?? "").trim() !== signerPub.trim())
      return { valid: false, reason: `signer is not parent ${cur.doc.issuer}'s key`, depth, chain };
    if (parent.doc.nonce !== cur.doc.parentNonce)
      return { valid: false, reason: "parent reference mismatch", depth, chain };
    const att = attenuates(cur.doc.constraints, parent.doc.constraints);
    if (!att.ok) return { valid: false, reason: `attenuation broken: ${att.reason}`, depth, chain };

    cur = parent;
    depth += 1;
    if (depth > 10) return { valid: false, reason: "delegation too deep", depth, chain };
  }
  return { valid: false, reason: "no root", depth, chain };
}
