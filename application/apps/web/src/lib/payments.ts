import "server-only";

import { MockPaymentProvider, type PaymentProvider } from "@brightloop/domain";

/**
 * Payment provider selection (approved Decision F: Stripe TEST MODE).
 *
 * The pipeline — intent → provider → webhook truth → guarded invoice/payment
 * machines → activation — is real. The PROVIDER is pluggable and defaults to the
 * deterministic mock until a Stripe key exists.
 *
 * ⚠️ Real charging is credential-blocked, not built around. A StripePaymentProvider
 * implementing PaymentProvider is dropped in here when STRIPE_SECRET_KEY is set;
 * nothing else in the flow changes because Stripe is a connector, not the source
 * of truth — the app's machines are.
 */
export function selectPaymentProvider(): PaymentProvider {
  // if (process.env.STRIPE_SECRET_KEY) return new StripePaymentProvider(process.env.STRIPE_SECRET_KEY);
  return new MockPaymentProvider();
}

/** True when a real (test or live) Stripe key is configured — drives honest UI copy. */
export function isPaymentsConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function paymentWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET ?? "";
}
