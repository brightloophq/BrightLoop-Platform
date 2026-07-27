/* =============================================================================
 * Deterministic stable hash (Phase E · Sprint E7) — PURE.
 *
 * Used for plan hashes, approval-payload hashes, checkpoint state hashes, and
 * idempotency keys. FNV-1a over a stable JSON encoding; no crypto, no io, no
 * randomness (safe to run inside resumable/replayable flows).
 * ========================================================================== */

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function stableHash(input: unknown): string {
  const str = typeof input === "string" ? input : stableStringify(input);
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** A stable idempotency key for a capability invocation within a mission/task. */
export function idempotencyKeyFor(missionId: string, taskKey: string, capabilityKey: string, input: unknown): string {
  return `${missionId}:${taskKey}:${capabilityKey}:${stableHash(input)}`;
}
