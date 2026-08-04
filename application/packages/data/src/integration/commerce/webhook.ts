/* =============================================================================
 * Commerce connectors — webhook signature verification (F4.4). PURE + DETERMINISTIC.
 *
 * Cryptographic HMAC verification for Shopify (base64 HMAC-SHA256 of the raw body)
 * and Stripe (`t=…,v1=…` scheme — hex HMAC-SHA256 of `${t}.${rawBody}`). Constant-
 * time comparison via `timingSafeEqual`. No network, no clock — the domain webhook
 * port is synchronous and deterministic, so these live in the data layer (which has
 * `@types/node`), never in the Node-free domain package. A signature is verified
 * against the RESOLVED signing secret only; the secret never leaks into a result.
 *
 * PayPal uses certificate-based verification through its online verify-webhook-
 * signature endpoint (an API call), which the synchronous port cannot perform — its
 * verification is structural (see paypal.ts) and documented as a known limitation.
 * ========================================================================== */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Constant-time equality of two ASCII/hex strings (length-safe). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Shopify: base64 HMAC-SHA256 of the raw body, compared to `X-Shopify-Hmac-Sha256`. */
export function verifyShopifyHmac(rawBody: string, signature: string | null, signingSecret: string | null): boolean {
  if (signingSecret === null || signingSecret.length === 0) return false;
  if (signature === null || signature.length === 0) return false;
  const digest = createHmac("sha256", signingSecret).update(rawBody, "utf8").digest("base64");
  return safeEqual(digest, signature.trim());
}

/** Parse a Stripe `Stripe-Signature` header into its `t` and `v1` components. */
export function parseStripeSignature(header: string): { t: string; v1: string[] } {
  let t = "";
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key === "t") t = val;
    else if (key === "v1") v1.push(val);
  }
  return { t, v1 };
}

/** Stripe: hex HMAC-SHA256 of `${t}.${rawBody}`, matched against any `v1` value. */
export function verifyStripeSignature(rawBody: string, signature: string | null, signingSecret: string | null): boolean {
  if (signingSecret === null || signingSecret.length === 0) return false;
  if (signature === null || signature.length === 0) return false;
  const { t, v1 } = parseStripeSignature(signature);
  if (t.length === 0 || v1.length === 0) return false;
  const expected = createHmac("sha256", signingSecret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  return v1.some((candidate) => safeEqual(expected, candidate));
}
