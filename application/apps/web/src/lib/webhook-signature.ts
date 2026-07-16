import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA256 webhook signature verification.
 *
 * Handoff §12: "n8n owns orchestration; the app receives status callbacks …
 * every callback signature is verified before it is trusted." A webhook is an
 * unauthenticated public endpoint — the signature is the ONLY thing proving the
 * payload really came from our n8n and wasn't forged by anyone who found the URL.
 *
 * Verify against the RAW request body, never a re-serialised object: JSON
 * round-tripping can reorder keys or change whitespace and break the HMAC. The
 * caller must pass the exact bytes received.
 */
export function verifyHmacSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  // Strip an optional "sha256=" prefix (a common convention).
  const provided = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  // Constant-time compare. Bail if lengths differ — timingSafeEqual throws on
  // mismatched lengths, and a length difference already means "not equal".
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  if (a.length !== b.length || a.length === 0) return false;

  return timingSafeEqual(a, b);
}

/** Sign a payload the way our n8n workflows are expected to. Used in tests + docs. */
export function signHmac(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}
