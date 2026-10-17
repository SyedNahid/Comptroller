import { NextResponse } from "next/server";
import { getComptroller } from "@/lib/comptroller/instance";
import { toMinor } from "@/lib/money";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json();
  const { comptroller } = getComptroller();
  const amountMinor = body.amountMinor ?? toMinor(Number(body.amount));
  try {
    const result = await comptroller.fundRequest({
      agentId: body.agentId,
      task: body.task,
      amountMinor,
      currency: body.currency,
      merchantCategory: body.merchantCategory,
      merchantName: body.merchantName,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
