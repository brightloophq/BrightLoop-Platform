/* =============================================================================
 * Integration Platform — event translation (F4.1). PURE.
 *
 * The framework's core value: external provider events → canonical internal
 * events. Adapters produce `CanonicalConnectorEvent[]`; this module validates,
 * bounds, and DEDUPES them deterministically before they are persisted. A
 * translated event without a stable externalId or type is DROPPED, never
 * fabricated. No io, no clock.
 * ========================================================================== */

import { sanitizeConnectorMetadata } from "./redaction.js";
import type { CanonicalConnectorEvent } from "./adapter-port.js";

/** Hard cap on how many events one ingestion turn may translate. */
export const MAX_EVENTS_PER_TURN = 500;

export interface TranslationTurn {
  /** Well-formed, sanitized, deduped events (bounded). */
  events: CanonicalConnectorEvent[];
  /** How many raw items were dropped as malformed/duplicate. */
  dropped: number;
}

/** A translated event is valid only with a non-empty externalId, type, occurredAt. */
export function isWellFormed(event: CanonicalConnectorEvent): boolean {
  return (
    typeof event.externalId === "string" && event.externalId.length > 0 &&
    typeof event.type === "string" && event.type.length > 0 &&
    typeof event.occurredAt === "string" && event.occurredAt.length > 0
  );
}

/**
 * Validate + sanitize + dedupe a batch of adapter-produced events. Dedupe is by
 * (externalId, type) — the same provider event translated twice is one event.
 * Payloads are sanitized (no secret material) and the batch is capped.
 */
export function normalizeTranslatedEvents(raw: readonly CanonicalConnectorEvent[]): TranslationTurn {
  const seen = new Set<string>();
  const events: CanonicalConnectorEvent[] = [];
  let dropped = 0;

  for (const item of raw) {
    if (events.length >= MAX_EVENTS_PER_TURN) { dropped += 1; continue; }
    if (!isWellFormed(item)) { dropped += 1; continue; }
    const dedupeKey = `${item.externalId}::${item.type}`;
    if (seen.has(dedupeKey)) { dropped += 1; continue; }
    seen.add(dedupeKey);
    events.push({
      type: item.type,
      externalId: item.externalId,
      occurredAt: item.occurredAt,
      payload: sanitizeConnectorMetadata(item.payload),
      provenance: typeof item.provenance === "string" ? item.provenance.slice(0, 500) : "",
    });
  }

  return { events, dropped };
}
