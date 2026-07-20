/* =============================================================================
 * Narrative events (Sprint 12 §19) — PURE constructors.
 *
 * Builders for the narrative.* stream — record only, no transport, no persistence.
 * ========================================================================== */

import { narrativeEventSchema, type NarrativeAudience, type NarrativeEvent, type NarrativeEventType } from "@brightloop/schema";

export function narrativeEvent(type: NarrativeEventType, scanId: string, now: string, artifactId: string | null = null, audience: NarrativeAudience | null = null, detail: string | null = null): NarrativeEvent {
  return narrativeEventSchema.parse({ type, scanId, artifactId, audience, at: now, detail });
}

export const requested = (scanId: string, audience: NarrativeAudience, now: string, detail?: string) => narrativeEvent("narrative.requested", scanId, now, null, audience, detail ?? null);
export const sectionCreated = (scanId: string, id: string, now: string, detail?: string) => narrativeEvent("narrative.section_created", scanId, now, id, null, detail ?? null);
export const claimRejected = (scanId: string, id: string | null, now: string, detail?: string) => narrativeEvent("narrative.claim_rejected", scanId, now, id, null, detail ?? null);
export const citationAdded = (scanId: string, id: string, now: string, detail?: string) => narrativeEvent("narrative.citation_added", scanId, now, id, null, detail ?? null);
export const redactionApplied = (scanId: string, id: string, audience: NarrativeAudience, now: string, detail?: string) => narrativeEvent("narrative.redaction_applied", scanId, now, id, audience, detail ?? null);
export const validationFailed = (scanId: string, id: string, now: string, detail?: string) => narrativeEvent("narrative.validation_failed", scanId, now, id, null, detail ?? null);
export const reviewRequired = (scanId: string, id: string, audience: NarrativeAudience, now: string, detail?: string) => narrativeEvent("narrative.review_required", scanId, now, id, audience, detail ?? null);
export const approved = (scanId: string, id: string, now: string, detail?: string) => narrativeEvent("narrative.approved", scanId, now, id, null, detail ?? null);
export const versionCreated = (scanId: string, id: string, now: string, detail?: string) => narrativeEvent("narrative.version_created", scanId, now, id, null, detail ?? null);
