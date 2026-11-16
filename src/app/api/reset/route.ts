import { NextResponse } from "next/server";
import { getComptroller, resealMandates } from "@/lib/comptroller/instance";
import { SEED_AGENTS } from "@/lib/agents/seed";

export const runtime = "nodejs";

export async function POST() {
  const { ledger } = getComptroller();
  ledger.reset();
  // Restore seed policies (the adaptive governor may have tightened some) and
  // re-sign every root mandate, so each demo replay starts from a clean baseline.
  for (const a of SEED_AGENTS) ledger.upsertAgent(a);
  resealMandates();
  return NextResponse.json({ ok: true });
}
