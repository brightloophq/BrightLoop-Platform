/* =============================================================================
 * Evidence validation (PDF 27 §07) — PURE.
 *
 * Structured validators over items + bundles: required fields, invalid
 * combinations, duplicate ids, future timestamps, unsupported states, unknown
 * sources, invalid reliability. Returns typed ValidationError[] (never throws);
 * deterministic given `now`.
 * ========================================================================== */

import {
  evidenceStateSchema,
  evidenceSourceSchema,
  type EngineEvidenceItem,
  type EvidenceBundle,
  type ValidationError,
} from "@brightloop/schema";

const STATES = new Set<string>(evidenceStateSchema.options);
const SOURCES = new Set<string>(evidenceSourceSchema.options);

/** Validate a single item at `now`. Returns [] when valid. */
export function validateItem(item: EngineEvidenceItem, now: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const err = (code: ValidationError["code"], detail: string) => errors.push({ code, itemId: item.id, detail });

  if (!item.id || !item.scanId || !item.timestamp) err("missing_required_field", "id, scanId, and timestamp are required");
  if (!SOURCES.has(item.source)) err("unknown_source", `unknown source '${item.source}'`);
  if (!STATES.has(item.state)) err("unsupported_state", `unsupported state '${item.state}'`);
  if (item.reliability < 0 || item.reliability > 1) err("invalid_reliability", "reliability must be within [0,1]");

  const ts = Date.parse(item.timestamp);
  if (!Number.isNaN(ts) && ts > Date.parse(now)) err("future_timestamp", "timestamp is in the future");

  // invalid combinations: an unavailable source cannot carry observed payload/citations/reliability
  if (item.state === "unavailable") {
    if (Object.keys(item.value).length > 0) err("invalid_combination", "unavailable evidence must carry no value");
    if (item.citations.length > 0) err("invalid_combination", "unavailable evidence must carry no citations");
    if (item.reliability > 0) err("invalid_combination", "unavailable evidence must have zero reliability");
  }
  return errors;
}

/** Validate a bundle: per-item checks + cross-item duplicate ids. */
export function validateBundle(bundle: EvidenceBundle, now: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Map<string, number>();
  for (const item of bundle.items) {
    errors.push(...validateItem(item, now));
    seen.set(item.id, (seen.get(item.id) ?? 0) + 1);
  }
  for (const [id, count] of seen) {
    if (count > 1) errors.push({ code: "duplicate_id", itemId: id, detail: `id '${id}' appears ${count} times` });
  }
  return errors;
}

export function isValidBundle(bundle: EvidenceBundle, now: string): boolean {
  return validateBundle(bundle, now).length === 0;
}
