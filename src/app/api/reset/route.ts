import { NextResponse } from "next/server";
import { getComptroller } from "@/lib/comptroller/instance";

export const runtime = "nodejs";

export async function POST() {
  const { ledger } = getComptroller();
  ledger.reset();
  return NextResponse.json({ ok: true });
}
