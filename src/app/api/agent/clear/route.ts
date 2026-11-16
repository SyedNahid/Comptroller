import { NextRequest, NextResponse } from "next/server";
import { getComptroller } from "@/lib/comptroller/instance";

export const runtime = "nodejs";

/** Operator action: clear a tripped circuit breaker so the agent resumes. */
export async function POST(req: NextRequest) {
  const { agentId } = (await req.json()) as { agentId?: string };
  if (!agentId) {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }
  const { comptroller } = getComptroller();
  comptroller.clearFreeze(agentId);
  return NextResponse.json({ ok: true });
}
