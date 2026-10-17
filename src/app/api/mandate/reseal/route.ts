import { NextResponse } from "next/server";
import { getComptroller, resealMandates } from "@/lib/comptroller/instance";

export const runtime = "nodejs";

/** Re-sign all mandates with the operator key (restores integrity after a tamper). */
export async function POST() {
  resealMandates();
  const { ledger } = getComptroller();
  ledger.appendAudit({
    ts: new Date().toISOString(),
    type: "MANDATE_RESEALED",
    message: "Operator re-signed all mandates — signatures valid again",
  });
  return NextResponse.json({ ok: true });
}
