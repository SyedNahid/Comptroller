import { getComptroller } from "@/lib/comptroller/instance";
import { toMajor } from "@/lib/money";

export const runtime = "nodejs";

/**
 * Reconciliation export — every agent dollar accounted for.
 * GET /api/export/reconciliation → CSV of fund requests joined to conversions,
 * cards, authorizations and clawbacks.
 */
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const { ledger } = getComptroller();
  const requests = ledger.getFundRequests(1000);
  const conversions = ledger.getConversions(1000);
  const cards = ledger.getCards(1000);
  const auths = ledger.getAuthorizations(1000);

  const convByReq = new Map(conversions.map((c) => [c.fund_request_id as string, c]));
  const cardByReq = new Map(cards.map((c) => [c.fund_request_id as string, c]));
  const authByReq = new Map(auths.map((a) => [a.fund_request_id as string, a]));

  const header = [
    "created_at", "agent", "task", "amount", "currency", "decision", "status",
    "fx_sell_ccy", "fx_sell_amount", "fx_client_rate", "est_saved",
    "card_id", "card_limit", "mcc", "auth_result", "auth_reason",
  ];

  const rows = requests.map((r) => {
    const c = convByReq.get(r.id);
    const card = cardByReq.get(r.id);
    const auth = authByReq.get(r.id);
    return [
      r.created_at, r.agent_id, r.task, toMajor(r.amount_minor), r.currency, r.decision, r.status,
      c?.sell_currency ?? "", c ? toMajor(c.sell_amount_minor as number) : "", c?.client_rate ?? "",
      c ? toMajor(c.saved_minor as number) : "",
      card?.card_id ?? "", card ? toMajor(card.limit_minor as number) : "", card?.merchant_cat ?? "",
      auth?.result ?? "", auth?.reason ?? "",
    ].map(csvCell).join(",");
  });

  const csv = [header.join(","), ...rows].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="comptroller-reconciliation.csv"',
    },
  });
}
