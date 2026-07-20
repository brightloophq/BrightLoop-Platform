/* =============================================================================
 * Proposal events (Sprint 11 §16) — PURE constructors.
 *
 * Builders for the proposal.* stream — record only, no transport, no persistence.
 * ========================================================================== */

import { proposalEventSchema, type ProposalEvent, type ProposalEventType } from "@brightloop/schema";

export function proposalEvent(type: ProposalEventType, scanId: string, now: string, proposalId: string | null = null, version: number | null = null, detail: string | null = null): ProposalEvent {
  return proposalEventSchema.parse({ type, scanId, proposalId, version, at: now, detail });
}

export const requested = (scanId: string, now: string, detail?: string) => proposalEvent("proposal.requested", scanId, now, null, null, detail ?? null);
export const strategyCreated = (scanId: string, now: string, detail?: string) => proposalEvent("proposal.strategy_created", scanId, now, null, null, detail ?? null);
export const scopeCreated = (scanId: string, now: string, detail?: string) => proposalEvent("proposal.scope_created", scanId, now, null, null, detail ?? null);
export const optionsCreated = (scanId: string, now: string, detail?: string) => proposalEvent("proposal.options_created", scanId, now, null, null, detail ?? null);
export const versionCreated = (scanId: string, id: string, version: number, now: string, detail?: string) => proposalEvent("proposal.version_created", scanId, now, id, version, detail ?? null);
export const reviewRequired = (scanId: string, id: string | null, now: string, detail?: string) => proposalEvent("proposal.review_required", scanId, now, id, null, detail ?? null);
export const approvedForSend = (scanId: string, id: string, version: number, now: string, detail?: string) => proposalEvent("proposal.approved_for_send", scanId, now, id, version, detail ?? null);
export const revisionRequested = (scanId: string, id: string, version: number, now: string, detail?: string) => proposalEvent("proposal.revision_requested", scanId, now, id, version, detail ?? null);
export const accepted = (scanId: string, id: string, version: number, now: string, detail?: string) => proposalEvent("proposal.accepted", scanId, now, id, version, detail ?? null);
export const rejected = (scanId: string, id: string, version: number, now: string, detail?: string) => proposalEvent("proposal.rejected", scanId, now, id, version, detail ?? null);
export const expired = (scanId: string, id: string, version: number, now: string, detail?: string) => proposalEvent("proposal.expired", scanId, now, id, version, detail ?? null);
