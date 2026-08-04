/* =============================================================================
 * Social connectors — webhook signature verification (F4.7). PURE + DETERMINISTIC.
 *
 * Meta (Facebook + Instagram) is the only social provider that signs webhook
 * deliveries in a form the synchronous webhook port can verify offline:
 *   • Meta — `X-Hub-Signature-256` header, value `sha256=<hex>` =
 *     HMAC-SHA256(rawBody, appSecret), lower-case hex.
 * LinkedIn, X, and TikTok have no first-class body-signed webhook of this shape and
 * are polling-only. Constant-time comparison via `timingSafeEqual` over the decoded
 * digest bytes. No network, no clock — the domain webhook port is synchronous and
 * deterministic, so these live in the data layer (which has `@types/node`), never in
 * the Node-free domain package. A signature is verified against the RESOLVED signing
 * secret only; the secret never leaks upward.
 * ========================================================================== */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Constant-time equality of two ASCII/hex strings (length-safe). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Verify a Meta `X-Hub-Signature-256` body signature against a resolved app secret.
 * The header value carries an optional `sha256=` prefix; the computed digest is
 * lower-case hex and compared constant-time. Case-insensitive on the provided hex.
 */
export function verifyHmacSha256Hex(rawBody: string, signature: string | null, signingSecret: string | null): boolean {
  if (signingSecret === null || signingSecret.length === 0) return false;
  if (signature === null || signature.length === 0) return false;
  const provided = signature.trim().replace(/^sha256=/i, "").toLowerCase();
  const digest = createHmac("sha256", signingSecret).update(rawBody, "utf8").digest("hex");
  return safeEqual(digest, provided);
}
