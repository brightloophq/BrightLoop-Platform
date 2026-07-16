import "server-only";

import { MockSignatureProvider, type SignatureProvider } from "@brightloop/domain";

/**
 * E-signature provider selection (approved Decision E/H: external e-sign, no
 * custom signature system).
 *
 * The `contract` machine is driven by provider callbacks in production. Until a
 * vendor (Dropbox Sign / DocuSign) is confirmed, the mock stands in and the
 * client completes signing IN-APP (a typed signature recorded via the
 * bl_client_contract_sign RPC). When a real provider is configured, sending
 * returns a signingUrl and the /api/webhooks/signatures route flips the state.
 */
export function selectSignatureProvider(): SignatureProvider {
  // if (process.env.ESIGN_API_KEY) return new DocuSignProvider(process.env.ESIGN_API_KEY);
  return new MockSignatureProvider();
}

export function isSignaturesConfigured(): boolean {
  return Boolean(process.env.ESIGN_API_KEY);
}

export function signatureWebhookSecret(): string {
  return process.env.ESIGN_WEBHOOK_SECRET ?? "";
}
