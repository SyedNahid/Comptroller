/**
 * Proof: delegated mandates (cryptographic, budget-aware capability attenuation).
 *
 * Shows an agent safely "hiring" another agent — the crown-jewel differentiator.
 * Run:  npm run demo:delegation
 */

import { randomUUID } from "node:crypto";
import {
  generateOperatorKeypair,
  signMandate,
  deriveSubMandate,
  verifyChain,
  type MandateDoc,
  type SignedMandate,
} from "../src/lib/mandate/signing";
import { toMinor } from "../src/lib/money";

const op = generateOperatorKeypair();
const adBuyerKeys = generateOperatorKeypair(); // reuse Ed25519 keygen for agents
const subKeys = generateOperatorKeypair();

const now = new Date();
const yearOut = new Date(now.getTime() + 365 * 24 * 3600 * 1000).toISOString();

// Root mandate: operator empowers "ad-buyer" ($500/task, ads only), including its pubkey.
const rootDoc: MandateDoc = {
  agentId: "ad-buyer",
  constraints: {
    perTaskCapMinor: toMinor(500),
    dailyCapMinor: toMinor(1000),
    autoApproveThresholdMinor: toMinor(500),
    allowedCurrencies: ["USD"],
    allowedMerchantCategories: ["7311"],
  },
  issuedAt: now.toISOString(),
  expiresAt: yearOut,
  nonce: randomUUID(),
  subjectPublicKeyPem: adBuyerKeys.publicKeyPem,
  issuer: "operator",
};
const rootSM = signMandate(rootDoc, op.privateKeyPem, op.publicKeyPem);

// ad-buyer delegates a $100 sub-budget (ads only) to a child creative agent.
const childSM = deriveSubMandate({
  parent: rootSM,
  childAgentId: "ad-buyer/creative-sub",
  childConstraints: {
    perTaskCapMinor: toMinor(100),
    dailyCapMinor: toMinor(100),
    autoApproveThresholdMinor: toMinor(100),
    allowedCurrencies: ["USD"],
    allowedMerchantCategories: ["7311"],
  },
  childSubjectPublicKeyPem: subKeys.publicKeyPem,
  parentPrivateKeyPem: adBuyerKeys.privateKeyPem,
  nonce: randomUUID(),
});

const store: Record<string, SignedMandate> = {
  "ad-buyer": rootSM,
  "ad-buyer/creative-sub": childSM,
};
const resolve = (id: string) => store[id];

console.log("1) Valid chain child → operator:");
console.dir(verifyChain(childSM, resolve, op.publicKeyPem), { depth: 4 });

console.log("\n2) Illegal delegation (child cap $900 > parent $500) is rejected at mint:");
try {
  deriveSubMandate({
    parent: rootSM,
    childAgentId: "ad-buyer/greedy",
    childConstraints: { ...rootDoc.constraints, perTaskCapMinor: toMinor(900) },
    childSubjectPublicKeyPem: subKeys.publicKeyPem,
    parentPrivateKeyPem: adBuyerKeys.privateKeyPem,
    nonce: randomUUID(),
  });
  console.log("   ✗ ERROR: should have thrown");
} catch (e) {
  console.log("   ✅ blocked:", String(e).replace("Error: ", ""));
}

console.log("\n3) Illegal delegation (child MCC 5812 not in parent [7311]) is rejected:");
try {
  deriveSubMandate({
    parent: rootSM,
    childAgentId: "ad-buyer/offmcc",
    childConstraints: { ...rootDoc.constraints, perTaskCapMinor: toMinor(50), allowedMerchantCategories: ["5812"] },
    childSubjectPublicKeyPem: subKeys.publicKeyPem,
    parentPrivateKeyPem: adBuyerKeys.privateKeyPem,
    nonce: randomUUID(),
  });
  console.log("   ✗ ERROR: should have thrown");
} catch (e) {
  console.log("   ✅ blocked:", String(e).replace("Error: ", ""));
}

console.log("\n4) Revoke the PARENT → the child's whole chain dies:");
const revoked = new Set([rootDoc.nonce]);
console.dir(verifyChain(childSM, resolve, op.publicKeyPem, (n) => revoked.has(n)), { depth: 2 });

console.log("\n5) Tamper the child constraints after signing → signature mismatch:");
const tampered: SignedMandate = JSON.parse(JSON.stringify(childSM));
tampered.doc.constraints.perTaskCapMinor = toMinor(100000);
const store2: Record<string, SignedMandate> = { ...store, "ad-buyer/creative-sub": tampered };
console.dir(verifyChain(tampered, (id) => store2[id], op.publicKeyPem), { depth: 2 });

console.log("\nDelegation proof complete.");
