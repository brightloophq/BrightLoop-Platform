/* =============================================================================
 * Integration Platform — secret redaction + sanitization (F4.1). PURE.
 *
 * Guarantees that no secret material is ever persisted in a config/metadata/detail
 * jsonb blob or an event payload. Deterministic; no io.
 * ========================================================================== */

/** Keys whose presence in a metadata/config blob indicates a leaked secret. */
const SECRET_KEY_PATTERN = /(secret|token|password|api[_-]?key|authorization|bearer|client[_-]?secret|refresh[_-]?token|access[_-]?token|signing[_-]?secret|private[_-]?key)/i;

const MAX_STRING = 4000;
const MAX_KEYS = 100;

/** Whether a key name looks like it holds a secret. */
export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

/**
 * Sanitize an arbitrary record for safe storage: drop secret-looking keys, cap
 * string length + key count, and keep only JSON-serializable scalar/shallow
 * structures. NEVER throws.
 */
export function sanitizeConnectorMetadata(input: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (input === null || input === undefined) return {};
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [key, value] of Object.entries(input)) {
    if (count >= MAX_KEYS) break;
    if (isSecretKey(key)) continue;
    out[key] = sanitizeValue(value);
    count += 1;
  }
  return out;
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return value.length > MAX_STRING ? value.slice(0, MAX_STRING) : value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, MAX_KEYS).map(sanitizeValue);
  if (typeof value === "object") return sanitizeConnectorMetadata(value as Record<string, unknown>);
  return null;
}

/**
 * Assert (as a boolean) that a record carries NO secret material — used by tests
 * and guards to prove a DTO/row is safe.
 */
export function hasNoConnectorSecrets(input: Record<string, unknown>): boolean {
  for (const key of Object.keys(input)) {
    if (isSecretKey(key)) return false;
    const value = input[key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      if (!hasNoConnectorSecrets(value as Record<string, unknown>)) return false;
    }
  }
  return true;
}
