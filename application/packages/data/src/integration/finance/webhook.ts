/* =============================================================================
 * Finance connectors — webhook signature verification (F4.6). PURE + DETERMINISTIC.
 *
 * Both finance providers sign the raw request body with HMAC-SHA256 and present the
 * digest as base64:
 *   • QuickBooks — `intuit-signature` header, HMAC-SHA256(rawBody, verifierToken).
 *   • Xero       — `x-xero-signature` header, HMAC-SHA256(rawBody, webhookSigningKey).
 * Constant-time comparison via `timingSafeEqual` over the decoded digest bytes. No
 * network, no clock — the domain webhook port is synchronous and deterministic, so
 * these live in the data layer (which has `@types/node`), never in the Node-free domain
 * package. A signature is verified against the RESOLVED signing secret only; the secret
 * never leaks upward.
 * ========================================================================== */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Constant-time equality of two ASCII/hex/base64 strings (length-safe). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Verify a base64 HMAC-SHA256 body signature against a resolved signing secret.
 * Shared by QuickBooks (`intuit-signature`) and Xero (`x-xero-signature`). The provided
 * signature is trimmed and compared constant-time to the computed base64 digest.
 */
export function verifyHmacSha256Base64(rawBody: string, signature: string | null, signingSecret: string | null): boolean {
  if (signingSecret === null || signingSecret.length === 0) return false;
  if (signature === null || signature.length === 0) return false;
  const digest = createHmac("sha256", signingSecret).update(rawBody, "utf8").digest("base64");
  return safeEqual(digest, signature.trim());
}
