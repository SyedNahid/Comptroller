import { NextResponse } from "next/server";
import { getComptroller } from "@/lib/comptroller/instance";

export const runtime = "nodejs";

/**
 * Demo: tamper with an agent's stored mandate (raise its cap without re-signing).
 * The Ed25519 signature no longer matches — Comptroller will refuse all its spend.
 * POST { agentId }
 */
export async function POST(req: Request) {
  const { agentId } = await req.json();
  const { ledger } = getComptroller();
  ledger.tamperMandate(agentId);
  ledger.appendAudit({
    ts: new Date().toISOString(),
    agentId,
    type: "MANDATE_TAMPERED",
    message: `Mandate for ${agentId} was edited without re-signing — signature now invalid`,
  });
  return NextResponse.json({ ok: true });
}
