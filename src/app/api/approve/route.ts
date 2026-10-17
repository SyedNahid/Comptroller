import { NextResponse } from "next/server";
import { getComptroller } from "@/lib/comptroller/instance";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { id } = await req.json();
  const { comptroller } = getComptroller();
  try {
    const result = await comptroller.approveFundRequest(id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
