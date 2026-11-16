import { NextResponse } from "next/server";
import { getComptroller } from "@/lib/comptroller/instance";
import { toMinor } from "@/lib/money";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Governed real supplier payout (Airwallex transfer).
 *  POST { agentId, amount, currency, supplierName, merchantCategory? } */
export async function POST(req: Request) {
  const b = await req.json();
  const { comptroller } = getComptroller();
  try {
    const r = await comptroller.payBeneficiary({
      agentId: b.agentId,
      task: b.task ?? "supplier payment",
      amountMinor: b.amountMinor ?? toMinor(Number(b.amount)),
      currency: b.currency ?? "USD",
      supplierName: b.supplierName ?? "Acme Supplies LLC",
      merchantCategory: b.merchantCategory,
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
