import { NextResponse } from "next/server";
import { revokeAgent } from "@/lib/comptroller/instance";

export const runtime = "nodejs";

/** Revoke an agent's mandate — cascades to all of its sub-delegations.
 *  POST { agentId } */
export async function POST(req: Request) {
  const { agentId } = await req.json();
  revokeAgent(agentId);
  return NextResponse.json({ ok: true });
}
