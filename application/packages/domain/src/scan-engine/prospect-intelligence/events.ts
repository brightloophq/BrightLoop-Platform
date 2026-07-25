/* =============================================================================
 * Prospect intelligence events (Phase C · Sprint C5) — PURE constructors.
 *
 * Builders for the `prospect.*` stream: record only. No transport, no
 * persistence, no runtime coupling — the caller decides what to do with them.
 * ========================================================================== */

import { prospectEventSchema, type ProspectEvent, type ProspectEventType } from "@brightloop/schema";

export function prospectEvent(
  type: ProspectEventType,
  scanId: string,
  now: string,
  artifactId: string | null = null,
  detail: string | null = null,
): ProspectEvent {
  return prospectEventSchema.parse({ type, scanId, at: now, artifactId, detail });
}

export const profileDerived = (scanId: string, now: string, detail?: string) => prospectEvent("prospect.profile_derived", scanId, now, null, detail ?? null);
export const maturityScored = (scanId: string, now: string, detail?: string) => prospectEvent("prospect.maturity_scored", scanId, now, null, detail ?? null);
export const findingsDerived = (scanId: string, now: string, detail?: string) => prospectEvent("prospect.findings_derived", scanId, now, null, detail ?? null);
export const opportunitiesDerived = (scanId: string, now: string, detail?: string) => prospectEvent("prospect.opportunities_derived", scanId, now, null, detail ?? null);
export const risksDerived = (scanId: string, now: string, detail?: string) => prospectEvent("prospect.risks_derived", scanId, now, null, detail ?? null);
export const readinessComputed = (scanId: string, now: string, detail?: string) => prospectEvent("prospect.readiness_computed", scanId, now, null, detail ?? null);
export const summaryAssembled = (scanId: string, now: string, detail?: string) => prospectEvent("prospect.summary_assembled", scanId, now, null, detail ?? null);
export const artifactCreated = (scanId: string, artifactId: string, now: string, detail?: string) => prospectEvent("prospect.artifact_created", scanId, now, artifactId, detail ?? null);
export const reviewRequired = (scanId: string, now: string, detail?: string) => prospectEvent("prospect.review_required", scanId, now, null, detail ?? null);
export const evidenceInsufficient = (scanId: string, now: string, detail?: string) => prospectEvent("prospect.evidence_insufficient", scanId, now, null, detail ?? null);
