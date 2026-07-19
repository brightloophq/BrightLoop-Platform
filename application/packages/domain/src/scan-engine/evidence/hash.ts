/* =============================================================================
 * Deterministic content hash (checksum) — PURE, no dependencies.
 *
 * FNV-1a (32-bit) over a CANONICAL JSON serialization (object keys sorted), so
 * the same content always hashes to the same value regardless of key order.
 * Used for content checksums and duplicate detection. Not cryptographic — a
 * fast, dependency-free, fully deterministic digest.
 * ========================================================================== */

/** Stable JSON: object keys sorted recursively so equal content ⇒ equal string. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sort(value));
}

function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sort((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** FNV-1a 32-bit digest of a string, returned as 8-char lowercase hex. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts, kept in uint32
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Content hash of an arbitrary value (canonicalized first). Deterministic. */
export function hashContent(value: unknown): string {
  return fnv1a(canonicalize(value));
}
