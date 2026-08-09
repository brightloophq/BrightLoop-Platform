/* =============================================================================
 * Use-cases: the post-scan COMMERCIAL package (proposal, narrative, review).
 *
 * Read paths return the LATEST version regardless of status — the ADMIN review
 * surface must see a needs_review draft, unlike the client-facing `getScanProposal`
 * / `getScanNarrative` which only ever expose an APPROVED artifact. The review
 * decision is an APPEND-ONLY runtime event (no new table): every approve /
 * request-revision / reject is recorded with the acting user, and the current
 * decision is a deterministic fold of that log. Approving requires the grant
 * authority capability (owner/admin) — strictly more than reading.
 *
 * Nothing here sends, publishes, or contacts the prospect.
 * ========================================================================== */

import { RUNTIME_EVENTS, type RuntimeEventName } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { PACKAGE_REVIEW_CAP, SCAN_READ_CAP } from "../context.js";
import type { ArtifactDTO, NarrativeDTO } from "../dto.js";
import { toProposalDTO, toNarrativeDTO } from "../dto.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { loadAuthorizedRun } from "./shared.js";
import type { PackageReviewDecision } from "./package-readiness.js";

const CLIENT_AUDIENCE = "client";
const NOTE_MAX = 500;

/** The latest commercial proposal DRAFT (any status) — for the admin review surface. */
export async function getScanCommercialProposal(ctx: AppContext, rawRunId: unknown): Promise<ArtifactDTO> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_READ_CAP);
  const latest = unwrap(await ctx.services.proposals.latest(run.id), { not_found: () => new NotFoundError("commercial proposal") });
  return toProposalDTO(latest);
}

/** The latest client narrative (any status) — for the admin review surface. */
export async function getScanClientNarrative(ctx: AppContext, rawRunId: unknown): Promise<NarrativeDTO> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_READ_CAP);
  const latest = unwrap(await ctx.services.narratives.latest(run.id, CLIENT_AUDIENCE), { not_found: () => new NotFoundError("client narrative") });
  return toNarrativeDTO(latest);
}

export interface ProspectPackageReviewDTO {
  decision: PackageReviewDecision;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string | null;
}

const REVIEW_EVENT_DECISION: Record<string, PackageReviewDecision> = {
  [RUNTIME_EVENTS.reviewApproved]: "approved",
  [RUNTIME_EVENTS.reviewRevisionRequested]: "revision_requested",
  [RUNTIME_EVENTS.reviewRejected]: "rejected",
};

/** The current review decision — a deterministic fold of the append-only event log. */
export async function getProspectPackageReview(ctx: AppContext, rawRunId: unknown): Promise<ProspectPackageReviewDTO> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_READ_CAP);
  const events = unwrap(await ctx.services.events.list({ aggregateType: "intelligence_run", aggregateId: run.id }));
  // Latest decision wins (events are monotonically sequenced per aggregate).
  const decisions = events.filter((e) => e.eventType in REVIEW_EVENT_DECISION).sort((a, b) => a.sequence - b.sequence);
  const last = decisions[decisions.length - 1];
  if (last === undefined) return { decision: "pending", decidedBy: null, decidedAt: null, note: null };
  const by = typeof last.payload["by"] === "string" ? (last.payload["by"] as string) : null;
  return {
    decision: REVIEW_EVENT_DECISION[last.eventType]!,
    decidedBy: last.actor ?? by,
    decidedAt: last.occurredAt,
    note: typeof last.payload["note"] === "string" ? (last.payload["note"] as string) : null,
  };
}

/** The review actions an admin can take on a generated package. */
export type PackageReviewAction = "approve" | "request_revision" | "reject";
const ACTION_EVENT: Record<PackageReviewAction, RuntimeEventName> = {
  approve: RUNTIME_EVENTS.reviewApproved,
  request_revision: RUNTIME_EVENTS.reviewRevisionRequested,
  reject: RUNTIME_EVENTS.reviewRejected,
};

export interface DecideProspectPackageInput {
  action: PackageReviewAction;
  note?: string;
}

/**
 * Record a review decision on the prospect package. Requires the grant-authority
 * capability (owner/admin). Appends an auditable runtime event carrying the acting
 * user; it does NOT send or publish anything.
 */
export async function decideProspectPackage(ctx: AppContext, rawRunId: unknown, input: DecideProspectPackageInput): Promise<ProspectPackageReviewDTO> {
  const run = await loadAuthorizedRun(ctx, rawRunId, PACKAGE_REVIEW_CAP);
  const action = input.action;
  if (action !== "approve" && action !== "request_revision" && action !== "reject") {
    throw new ValidationError("'action' must be approve | request_revision | reject", { action: "invalid_value" });
  }
  const note = typeof input.note === "string" ? input.note.slice(0, NOTE_MAX) : null;

  unwrap(
    await ctx.services.events.emit({
      eventType: ACTION_EVENT[action],
      aggregateType: "intelligence_run",
      aggregateId: run.id,
      clientId: run.clientId,
      runId: run.id,
      scanId: run.scanId,
      payload: { by: ctx.actor.userId, ...(note !== null ? { note } : {}) },
    }),
  );

  return getProspectPackageReview(ctx, rawRunId);
}
