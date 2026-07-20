/* =============================================================================
 * Competitor events (Sprint 10 §17) — PURE constructors.
 *
 * Builders for the competitor.* stream — record only, no transport, no
 * persistence. Each event carries the scan id, an optional candidate id, a
 * supplied timestamp, and an optional structured detail.
 * ========================================================================== */

import { competitorEventSchema, type CompetitorEvent, type CompetitorEventType } from "@brightloop/schema";

export function competitorEvent(type: CompetitorEventType, scanId: string, now: string, candidateId: string | null = null, detail: string | null = null): CompetitorEvent {
  return competitorEventSchema.parse({ type, scanId, candidateId, at: now, detail });
}

export const candidateDiscovered = (scanId: string, id: string, now: string, detail?: string) => competitorEvent("competitor.candidate_discovered", scanId, now, id, detail ?? null);
export const candidateValidated = (scanId: string, id: string, now: string, detail?: string) => competitorEvent("competitor.candidate_validated", scanId, now, id, detail ?? null);
export const candidateRejected = (scanId: string, id: string, now: string, detail?: string) => competitorEvent("competitor.candidate_rejected", scanId, now, id, detail ?? null);
export const setRanked = (scanId: string, now: string, detail?: string) => competitorEvent("competitor.set_ranked", scanId, now, null, detail ?? null);
export const benchmarkCreated = (scanId: string, now: string, detail?: string) => competitorEvent("competitor.benchmark_created", scanId, now, null, detail ?? null);
export const gapDetected = (scanId: string, now: string, detail?: string) => competitorEvent("competitor.gap_detected", scanId, now, null, detail ?? null);
export const marketPositionCreated = (scanId: string, now: string, detail?: string) => competitorEvent("competitor.market_position_created", scanId, now, null, detail ?? null);
export const snapshotCreated = (scanId: string, now: string, detail?: string) => competitorEvent("competitor.snapshot_created", scanId, now, null, detail ?? null);
export const changeDetected = (scanId: string, now: string, detail?: string) => competitorEvent("competitor.change_detected", scanId, now, null, detail ?? null);
export const reviewRequired = (scanId: string, id: string | null, now: string, detail?: string) => competitorEvent("competitor.review_required", scanId, now, id, detail ?? null);
