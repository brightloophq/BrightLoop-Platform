/* =============================================================================
 * Execution Runtime — secret redaction + log sanitization (F3). PURE.
 *
 * The single guarantee: no secret material ever reaches a DTO, read model, log,
 * error, audit record, or web response. Sensitive keys are dropped; oversized or
 * body-like fields are replaced with a marker. No io.
 * ========================================================================== */

const SENSITIVE_KEY = /(authorization|api[-_]?key|apikey|access[-_]?token|bearer|token|password|passwd|secret|cookie|set-cookie|credential|private[-_]?key|client[-_]?secret|webhook[-_]?secret|signature)/i;
const BODYLIKE_KEY = /(^|_)(body|response|payload|raw|headers|data)$/i;
const REDACTED = "[redacted]";
const MAX_STRING = 512;

/** True when a key name denotes secret material that must never be persisted/shown. */
export const isSensitiveKey = (key: string): boolean => SENSITIVE_KEY.test(key);

/** Recursively sanitize an arbitrary metadata object for safe persistence/display. */
export function sanitizeMetadata(input: unknown, depth = 0): Record<string, unknown> {
  if (depth > 6 || input === null || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) { out[key] = REDACTED; continue; }
    if (BODYLIKE_KEY.test(key)) { out[key] = REDACTED; continue; }
    out[key] = sanitizeValue(value, depth);
  }
  return out;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : redactInline(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitizeValue(v, depth + 1));
  if (typeof value === "object") return sanitizeMetadata(value, depth + 1);
  return REDACTED;
}

/** Redact secret-looking substrings inside a free-text string (bearer tokens, keys). */
export function redactInline(text: string): string {
  return text
    .replace(/(bearer\s+)[A-Za-z0-9._-]+/gi, `$1${REDACTED}`)
    .replace(/([?&](?:api[-_]?key|token|secret|password)=)[^&\s]+/gi, `$1${REDACTED}`)
    .replace(/(sk|pk|key|token)[-_][A-Za-z0-9]{12,}/gi, REDACTED);
}

/** Assert an object carries NO sensitive keys (used in tests + defensive checks). */
export function hasNoSecrets(obj: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY.test(k) && v !== REDACTED) return false;
    if (v !== null && typeof v === "object" && !Array.isArray(v) && !hasNoSecrets(v as Record<string, unknown>)) return false;
  }
  return true;
}
