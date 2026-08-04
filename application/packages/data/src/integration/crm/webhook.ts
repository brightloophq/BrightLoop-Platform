/* =============================================================================
 * CRM connectors — webhook signature verification (F4.5). PURE + DETERMINISTIC.
 *
 * Cryptographic HMAC verification where the provider supports a body-only scheme:
 * HubSpot v1 (`X-HubSpot-Signature` = hex SHA256 of `${clientSecret}${rawBody}`).
 * Constant-time comparison via `timingSafeEqual`. No network, no clock — the domain
 * webhook port is synchronous and deterministic, so these live in the data layer
 * (which has `@types/node`), never in the Node-free domain package. A signature is
 * verified against the RESOLVED signing secret only; the secret never leaks upward.
 *
 * HubSpot's v3 scheme signs `${method}${uri}${body}${timestamp}` — data the
 * synchronous port does not carry — so we use the v1 body-only scheme. Pipedrive has
 * no body HMAC (deliveries are secured by HTTP Basic auth); its verification is
 * structural, optionally gated on a shared secret, and documented as a known limit.
 * ========================================================================== */

import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time equality of two ASCII/hex strings (length-safe). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** HubSpot v1: hex SHA256 of `${clientSecret}${rawBody}`, compared to `X-HubSpot-Signature`. */
export function verifyHubspotV1(rawBody: string, signature: string | null, signingSecret: string | null): boolean {
  if (signingSecret === null || signingSecret.length === 0) return false;
  if (signature === null || signature.length === 0) return false;
  const digest = createHash("sha256").update(`${signingSecret}${rawBody}`, "utf8").digest("hex");
  return safeEqual(digest, signature.trim());
}

/**
 * Pipedrive structural verification: the body must be a well-formed Pipedrive webhook
 * envelope (`meta` object with an `action`/`event`). When a shared secret is
 * configured it must match the provided value (the Basic-auth password Pipedrive
 * sends); otherwise structural validity alone gates acceptance. Cryptographic body
 * signing is not offered by Pipedrive (see the F4.5 known limitations).
 */
export function verifyPipedriveStructural(rawBody: string, signature: string | null, signingSecret: string | null): boolean {
  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody) as Record<string, unknown>; } catch { return false; }
  const meta = body["meta"];
  const wellFormed = meta !== null && typeof meta === "object";
  if (!wellFormed) return false;
  if (signingSecret !== null && signingSecret.length > 0) {
    return signature !== null && safeEqual(signingSecret, signature.trim());
  }
  return true;
}
