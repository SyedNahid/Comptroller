import { NextResponse } from "next/server";
import { getComptroller } from "@/lib/comptroller/instance";
import { toMinor } from "@/lib/money";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json();
  const { comptroller } = getComptroller();
  const spendMinor = body.spendMinor ?? toMinor(Number(body.spend));
  try {
    const result = await comptroller.simulateSpend({
      fundRequestId: body.fundRequestId,
      spendMinor,
      merchantCategory: body.merchantCategory,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
