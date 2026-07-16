/* =============================================================================
 * Payment provider boundary — Stripe (approved Decision F: TEST MODE in dev,
 * no live processing until production).
 *
 * Integration principle: Stripe is a connector, NOT the source of truth for app
 * state. Webhooks notify; the app's `payment`/`invoice` machines are authoritative
 * and every transition is guarded. Never store PAN — only last4/method.
 * ========================================================================== */

export interface CreatePaymentIntentInput {
  invoiceId: string;
  /** Integer minor units (cents). */
  amount: number;
  currency: "usd";
  clientId: string;
}

export interface PaymentIntentResult {
  providerRef: string;
  clientSecret: string;
  /** Maps onto the `payment` machine at the service layer. */
  status: "processing" | "succeeded" | "failed" | "pending_3ds";
}

export interface RefundInput {
  providerRef: string;
  amount: number;
}

export interface PaymentProvider {
  readonly name: string;
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult>;
  refund(input: RefundInput): Promise<{ ok: boolean }>;
  /** Webhook signatures MUST be verified before any state change. */
  verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean;
}

/**
 * Deterministic mock used until the Stripe adapter lands (Sprint 6).
 * Returns predictable refs so tests and local flows are reproducible.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  private counter = 0;

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult> {
    this.counter += 1;
    return {
      providerRef: `pi_mock_${this.counter}`,
      clientSecret: `pi_mock_${this.counter}_secret`,
      status: input.amount > 0 ? "processing" : "failed",
    };
  }

  async refund(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  /** The mock accepts only a literal sentinel — it never blanket-returns true. */
  verifyWebhookSignature(_rawBody: string, signature: string): boolean {
    return signature === "mock-valid-signature";
  }
}
