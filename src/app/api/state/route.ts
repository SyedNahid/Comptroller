import { NextResponse } from "next/server";
import { getComptroller } from "@/lib/comptroller/instance";
import { airwallexFromEnv } from "@/lib/airwallex/client";

export const runtime = "nodejs";

interface Balance {
  currency: string;
  available_amount: number;
}

let balCache: { ts: number; data: Balance[] } | null = null;

export async function GET() {
  const { ledger, issuingKind } = getComptroller();

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

  return NextResponse.json({
    issuingKind,
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
