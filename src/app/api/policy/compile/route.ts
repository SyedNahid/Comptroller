import { NextResponse } from "next/server";
import { getComptroller, sealAgentMandate } from "@/lib/comptroller/instance";
import { compilePolicy } from "@/lib/agent/policy-compiler";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Compile a natural-language policy into a deterministic AgentPolicy, apply it,
 * and re-sign the agent's mandate with the operator key.
 * POST { agentId, text }
 */
export async function POST(req: Request) {
  const { agentId, text } = await req.json();
  const { ledger } = getComptroller();
  const current = ledger.getPolicy(agentId);
  if (!current) return NextResponse.json({ error: `Unknown agent ${agentId}` }, { status: 400 });

  try {
    const policy = await compilePolicy(current, String(text));
    ledger.upsertAgent(policy);
    sealAgentMandate(agentId); // operator re-signs the updated mandate
    ledger.appendAudit({
      ts: new Date().toISOString(),
      agentId,
      type: "POLICY_UPDATED",
      message: `Policy recompiled from natural language and re-signed: "${String(text).slice(0, 80)}"`,
    });
    return NextResponse.json({ ok: true, policy });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
