import { NextResponse } from "next/server";
import { getComptroller } from "@/lib/comptroller/instance";
import { airwallexFromEnv } from "@/lib/airwallex/client";
import { verifyChain, type SignedMandate } from "@/lib/mandate/signing";

export const runtime = "nodejs";

interface Balance {
  currency: string;
  available_amount: number;
}

let balCache: { ts: number; data: Balance[] } | null = null;

export async function GET() {
  const { ledger, issuingKind, operator, operatorFingerprint } = getComptroller();

  let balances: Balance[] = balCache?.data ?? [];
  if (!balCache || Date.now() - balCache.ts > 15_000) {
    try {
      const ax = airwallexFromEnv();
      const all = (await ax.getBalances()) as Balance[];
      balances = all.filter((b) => b.available_amount > 0);
      balCache = { ts: Date.now(), data: balances };
    } catch {
      // keep stale balances if the API call fails
    }
  }

  // Per-agent signed-mandate verification status.
  const mandates: Record<string, { verified: boolean; reason: string; issuer: string; depth: number }> = {};
  for (const a of ledger.getAgents()) {
    const sm = ledger.getMandate<SignedMandate>(a.agentId);
    const v = sm
      ? verifyChain(sm, (id) => ledger.getMandate<SignedMandate>(id), operator.publicKeyPem, (n) => ledger.isRevoked(n))
      : { valid: false, reason: "no signed mandate", depth: 0 };
    mandates[a.agentId] = {
      verified: v.valid,
      reason: v.reason,
      issuer: sm?.doc.issuer ?? "operator",
      depth: "depth" in v ? v.depth : 0,
    };
  }

  return NextResponse.json({
    issuingKind,
    operatorFingerprint,
    mandates,
    agents: ledger.getAgents(),
    requests: ledger.getFundRequests(50),
    conversions: ledger.getConversions(50),
    cards: ledger.getCards(50),
    authorizations: ledger.getAuthorizations(50),
    audit: ledger.getAuditLog(60),
    totalSavedMinor: ledger.totalSavedMinor(),
    balances,
  });
}
