/* =============================================================================
 * Transactional email boundary — approved Decision G: V1 ships in-app + email
 * notifications. SMS/WhatsApp/push are deferred to V2.
 *
 * Templates + sending live outside the app; the app emits events with a payload.
 * Rule: no marketing email without a recorded Consent.
 * ========================================================================== */

export interface SendEmailInput {
  to: string;
  /** Template identifier owned by the provider / n8n, not by this app. */
  template: string;
  data: Record<string, unknown>;
  /** Marketing sends require a granted Consent record; transactional do not. */
  kind: "transactional" | "marketing";
}

export interface EmailProvider {
  readonly name: string;
  send(input: SendEmailInput): Promise<{ ok: boolean; providerRef: string }>;
}

export class MockEmailProvider implements EmailProvider {
  readonly name = "mock";
  readonly sent: SendEmailInput[] = [];
  private counter = 0;

  async send(input: SendEmailInput): Promise<{ ok: boolean; providerRef: string }> {
    this.counter += 1;
    this.sent.push(input);
    return { ok: true, providerRef: `msg_mock_${this.counter}` };
  }

  clear(): void {
    this.sent.length = 0;
  }
}
