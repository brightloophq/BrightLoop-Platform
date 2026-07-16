/* =============================================================================
 * E-signature provider boundary — approved Decision E/H: proposals are generated
 * internally; SIGNATURES use an external provider. No custom signature system.
 *
 * The concrete adapter (Dropbox Sign / DocuSign) lands in Sprint 6 once the
 * provider is confirmed. Until then MockSignatureProvider stands in, so the
 * `contract` machine can be wired and tested end-to-end without a vendor.
 * ========================================================================== */

export interface SendForSignatureInput {
  contractId: string;
  clientId: string;
  signerEmail: string;
  signerName: string;
  /** URL of the SOW document to be signed. */
  sowUrl: string;
}

export interface SignatureEnvelope {
  providerRef: string;
  /** Where the signer completes signing. */
  signingUrl: string;
  status: "sent" | "signed" | "countersigned" | "voided";
}

export interface SignatureProvider {
  readonly name: string;
  send(input: SendForSignatureInput): Promise<SignatureEnvelope>;
  countersign(providerRef: string): Promise<SignatureEnvelope>;
  void(providerRef: string): Promise<{ ok: boolean }>;
  /** Provider callbacks drive `contract` transitions — verify before trusting. */
  verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean;
}

export class MockSignatureProvider implements SignatureProvider {
  readonly name = "mock";
  private counter = 0;

  async send(input: SendForSignatureInput): Promise<SignatureEnvelope> {
    this.counter += 1;
    return {
      providerRef: `env_mock_${this.counter}`,
      signingUrl: `https://signature.mock.local/sign/${input.contractId}`,
      status: "sent",
    };
  }

  async countersign(providerRef: string): Promise<SignatureEnvelope> {
    return {
      providerRef,
      signingUrl: `https://signature.mock.local/view/${providerRef}`,
      status: "countersigned",
    };
  }

  async void(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  verifyWebhookSignature(_rawBody: string, signature: string): boolean {
    return signature === "mock-valid-signature";
  }
}
