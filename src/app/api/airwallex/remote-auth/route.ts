import { createHmac, timingSafeEqual } from "node:crypto";
import { getComptroller } from "@/lib/comptroller/instance";

export const runtime = "nodejs";

/**
 * Airwallex Remote Authorization webhook — real-time approve/decline.
 *
 * Dormant until Airwallex enables Remote Authorization on the sandbox account, then
 * it enforces the mandate on EVERY charge in <2.5s. We verify the HMAC signature,
 * look up the card's scope in the ledger, and respond AUTHORIZED / DECLINED echoing
 * the transaction event id.
 *
 * Docs: /docs/issuing/card-controls/remote-authorization/respond-to-authorization-requests
 */

interface RemoteAuthPayload {
  card_transaction_event_id?: string;
  transaction_id?: string;
  card_id?: string;
  transaction_amount?: number;
  transaction_currency?: string;
  merchant?: { category_code?: string; name?: string };
}

function verifySignature(rawBody: string, nonce: string | null, signature: string | null): boolean {
  const secret = process.env.AIRWALLEX_REMOTE_AUTH_SECRET;
  if (!secret) return true; // not configured yet (sandbox) — accept
  if (!nonce || !signature) return false;
  const expected = createHmac("sha256", secret).update(nonce + rawBody).digest("base64");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  const nonce = req.headers.get("x-nonce");
  const signature = req.headers.get("x-signature");

  if (!verifySignature(raw, nonce, signature)) {
    return new Response("invalid signature", { status: 401 });
  }

  const p = JSON.parse(raw || "{}") as RemoteAuthPayload;
  const eventId = p.card_transaction_event_id ?? p.transaction_id;
  const { ledger } = getComptroller();

  const card = p.card_id ? ledger.getCardByCardId(p.card_id) : undefined;
  const amountMinor = Math.round((p.transaction_amount ?? 0) * 100);
  const mcc = p.merchant?.category_code;

  let status: "AUTHORIZED" | "DECLINED" = "AUTHORIZED";
  let reason = "within card scope";
  if (!card) {
    status = "DECLINED";
    reason = "unknown card";
  } else if (amountMinor > card.limit_minor) {
    status = "DECLINED";
    reason = "over card limit";
  } else if (card.merchant_cat && mcc && mcc !== card.merchant_cat) {
    status = "DECLINED";
    reason = "merchant category not allowed";
  }

  if (card) {
    const now = new Date().toISOString();
    ledger.recordAuthorization({
      cardId: card.card_id,
      fundRequestId: card.fund_request_id,
      amountMinor,
      currency: p.transaction_currency ?? card.currency,
      merchantCat: mcc,
      result: status,
      reason,
      createdAt: now,
    });
    ledger.appendAudit({
      ts: now,
      fundRequestId: card.fund_request_id,
      type: `AUTH_${status}`,
      message: `Remote auth ${status}: ${reason}`,
    });
  }

  return Response.json({
    card_transaction_event_id: eventId,
    response_status: status,
    status_reason: reason,
  });
}
