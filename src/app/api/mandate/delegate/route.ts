import { NextResponse } from "next/server";
import { delegateBudget } from "@/lib/comptroller/instance";
import { toMinor } from "@/lib/money";

export const runtime = "nodejs";

/**
 * A parent agent delegates an attenuated sub-budget to a child agent.
 * The sub-mandate is signed by the parent and must be ⊆ the parent's mandate.
 * POST { parentAgentId, childAgentId, perTaskCap, dailyCap?, autoApproveThreshold?,
 *        allowedCurrencies?, allowedMerchantCategories? }
 */
export async function POST(req: Request) {
  const b = await req.json();
  try {
    const perTask = toMinor(Number(b.perTaskCap));
    const policy = delegateBudget({
      parentAgentId: b.parentAgentId,
      childAgentId: b.childAgentId,
      constraints: {
        perTaskCapMinor: perTask,
        dailyCapMinor: b.dailyCap ? toMinor(Number(b.dailyCap)) : perTask,
        autoApproveThresholdMinor: b.autoApproveThreshold ? toMinor(Number(b.autoApproveThreshold)) : perTask,
        allowedCurrencies: b.allowedCurrencies ?? [],
        allowedMerchantCategories: b.allowedMerchantCategories ?? [],
      },
    });
    return NextResponse.json({ ok: true, policy });
  } catch (e) {
    return NextResponse.json({ error: String(e).replace("Error: ", "") }, { status: 400 });
  }
}
