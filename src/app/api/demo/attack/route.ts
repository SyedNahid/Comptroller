import { NextRequest, NextResponse } from "next/server";
import { getComptroller } from "@/lib/comptroller/instance";
import { toMinor } from "@/lib/money";

export const runtime = "nodejs";
export const maxDuration = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Simulate a compromised agent: a few normal buys, then a rapid burst of
 * off-mandate probing across new merchant categories. The adaptive governor
 * reacts in real time — flag → tighten (mandate re-signed) → freeze — and the
 * dashboard shows the risk score climb and the circuit breaker trip.
 *
 * This is the demo's gasp moment: even fully compromised, the agent cannot move
 * money once the breaker trips.
 */
const ARC: { amt: number; mcc: string; task: string }[] = [
  { amt: 40, mcc: "7311", task: "ad spend — Meta campaign" },
  { amt: 50, mcc: "7311", task: "ad spend — Google campaign" },
  { amt: 60, mcc: "7311", task: "ad spend — LinkedIn campaign" },
  { amt: 120, mcc: "7995", task: "[injected] transfer to external wallet" },
  { amt: 150, mcc: "5812", task: "[injected] gift-card purchase" },
  { amt: 180, mcc: "6051", task: "[injected] crypto on-ramp" },
];

export async function POST(req: NextRequest) {
  const { agentId = "ad-buyer" } = ((await req.json().catch(() => ({}))) ?? {}) as {
    agentId?: string;
  };
  const { comptroller } = getComptroller();

  const steps: { task: string; decision: string }[] = [];
  for (let i = 0; i < ARC.length; i++) {
    const s = ARC[i];
    const res = await comptroller.fundRequest({
      agentId,
      task: s.task,
      amountMinor: toMinor(s.amt),
      currency: "USD",
      merchantCategory: s.mcc,
    });
    steps.push({ task: s.task, decision: res.decision });
    // Space the steps so the dashboard's live poll shows the risk score climb
    // and the breaker trip, rather than jumping straight to the end state.
    if (i < ARC.length - 1) await sleep(700);
  }

  return NextResponse.json({ ok: true, agentId, steps });
}
