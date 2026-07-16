import { NextResponse, type NextRequest } from "next/server";
import { selectPaymentProvider, paymentWebhookSecret } from "@/lib/payments";
import { settlePaymentSucceeded } from "@/lib/settle";

/**
 * Payment provider webhook (Stripe in production). The provider notifies; the
 * app's invoice/payment machines are the source of truth.
 *
 * Defence order (same discipline as the n8n callback):
 *   1. verify the signature against the RAW body FIRST — no valid signature, 401.
 *   2. settle through settlePaymentSucceeded, which guards the invoice move and
 *      then attempts activation. Service-role writes, but the machine still guards.
 *
 * In mock mode there is no external caller — payInvoice settles inline — so this
 * route exists for the real provider and for signed integration tests.
 */
export async function POST(request: NextRequest) {
  const secret = paymentWebhookSecret();
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature") ?? request.headers.get("x-bl-signature") ?? "";

  const provider = selectPaymentProvider();
  if (!provider.verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { invoiceId?: string; amount?: number; last4?: string; method?: string; providerRef?: string; outcome?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.outcome && payload.outcome !== "succeeded") {
    return NextResponse.json({ ok: true, applied: false, note: `outcome ${payload.outcome} ignored` });
  }
  if (!payload.invoiceId || !payload.amount) {
    return NextResponse.json({ error: "Missing invoiceId or amount" }, { status: 400 });
  }

  const result = await settlePaymentSucceeded({
    invoiceId: payload.invoiceId,
    amount: payload.amount,
    last4: payload.last4 ?? null,
    method: payload.method ?? "card",
    providerRef: payload.providerRef ?? "unknown",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  return NextResponse.json({ ok: true, invoicePaid: result.invoicePaid, activated: result.activated });
}
