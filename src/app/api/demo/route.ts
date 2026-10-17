import { NextResponse } from "next/server";
import { getComptroller } from "@/lib/comptroller/instance";
import { toMinor } from "@/lib/money";
import type { FundRequest } from "@/lib/mandate/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Runs a scripted demo sequence against the live sandbox (FX) + stub issuer.
 * Leaves one NEEDS_HUMAN request PENDING so the operator can approve it live.
 */
export async function POST() {
  const { comptroller } = getComptroller();

  const auto: FundRequest[] = [
    { agentId: "ad-buyer", task: "Meta ads campaign", amountMinor: toMinor(400), currency: "USD", merchantCategory: "7311", merchantName: "Meta" },
    { agentId: "saas-procurement", task: "Figma seats", amountMinor: toMinor(150), currency: "EUR", merchantCategory: "5734", merchantName: "Figma" },
    { agentId: "data-vendor", task: "Market dataset", amountMinor: toMinor(250), currency: "GBP", merchantCategory: "7375", merchantName: "DataCo" },
  ];
  for (const r of auto) await comptroller.fundRequest(r);

  // A denial (off-mandate merchant).
  await comptroller.fundRequest({
    agentId: "ad-buyer", task: "Team dinner (!)", amountMinor: toMinor(120), currency: "USD", merchantCategory: "5812", merchantName: "Nobu",
  });

  // A request that needs human approval — left pending for the operator.
  await comptroller.fundRequest({
    agentId: "saas-procurement", task: "Notion enterprise", amountMinor: toMinor(350), currency: "EUR", merchantCategory: "7372", merchantName: "Notion",
  });

  return NextResponse.json({ ok: true });
}
