/* =============================================================================
 * Versioning, revisions & approvals (Sprint 11 §13/§14 · AIS-004 §04) — PURE.
 *
 * Proposal versions are IMMUTABLE: a revision produces a NEW artifact at version
 * n+1; the prior version is returned unchanged.
 *
 * HARD RULE: a MATERIAL change invalidates prior approval. Material = the content
 * checksum moved on scope, deliverables, milestones, packages, strategy, or
 * investment inputs. Cosmetic changes (title, validity period) do not reset.
 *
 * No digital signature, contract, or e-signature integration.
 * ========================================================================== */

import {
  proposalArtifactSchema,
  proposalRevisionSchema,
  type ApprovalDecision,
  type ProposalApproval,
  type ProposalArtifact,
  type ProposalRevision,
  type ProposalStatus,
  type RevisionReason,
} from "@brightloop/schema";
import { proposalChecksum } from "./artifact.js";

/* ---- status machine (AIS-004 §04, extended to the sprint's 10 states) ------ */
const TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ["internal_review", "withdrawn"],
  internal_review: ["approved_for_send", "draft", "withdrawn"],
  approved_for_send: ["sent", "draft", "withdrawn"],
  sent: ["viewed", "revision_requested", "accepted", "rejected", "expired", "withdrawn"],
  viewed: ["revision_requested", "accepted", "rejected", "expired", "withdrawn"],
  revision_requested: ["draft", "withdrawn"],
  accepted: [],
  rejected: ["draft"],
  expired: ["draft"],
  withdrawn: [],
};

export function canProposalTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Apply a status transition. Illegal transitions return the artifact unchanged. Pure. */
export function transitionProposal(artifact: ProposalArtifact, to: ProposalStatus, now: string): ProposalArtifact {
  if (!canProposalTransition(artifact.status, to)) return artifact;
  // `approved_for_send` requires every required approval to be granted
  if (to === "approved_for_send" && !requiredApprovalsMet(artifact.approvals)) return artifact;
  return proposalArtifactSchema.parse({ ...artifact, status: to, updatedAt: now });
}

/* ---- approvals ------------------------------------------------------------- */
export function requiredApprovalsMet(approvals: readonly ProposalApproval[]): boolean {
  const required = approvals.filter((a) => a.required);
  return required.length > 0 && required.every((a) => a.decision === "approved" || a.decision === "approved_with_conditions");
}

/** The next approval due, honouring `order`. Null when none is pending. Pure. */
export function nextPendingApproval(approvals: readonly ProposalApproval[]): ProposalApproval | null {
  return [...approvals].filter((a) => a.decision === "pending").sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id < b.id ? -1 : 1))[0] ?? null;
}

export interface RecordApprovalInput {
  approvalId: string;
  decision: ApprovalDecision;
  conditions?: string[];
  commentRef?: string | null;
  now: string;
  expiresAt?: string | null;
}

/** Record an approval decision. Returns a new artifact. Pure. */
export function recordApproval(artifact: ProposalArtifact, input: RecordApprovalInput): ProposalArtifact {
  const approvals = artifact.approvals.map((a) =>
    a.id === input.approvalId
      ? { ...a, decision: input.decision, conditions: input.conditions ?? a.conditions, commentRef: input.commentRef ?? a.commentRef, decidedAt: input.now, expiresAt: input.expiresAt ?? a.expiresAt }
      : a,
  );
  return proposalArtifactSchema.parse({ ...artifact, approvals, approvalRequirementsMet: requiredApprovalsMet(approvals), updatedAt: input.now });
}

/** Reset every approval to pending (used on a material revision). Pure. */
export function resetApprovals(approvals: readonly ProposalApproval[]): ProposalApproval[] {
  return approvals.map((a) => ({ ...a, decision: "pending" as ApprovalDecision, decidedAt: null, conditions: [], resetByRevision: true }));
}

/* ---- revisions ------------------------------------------------------------- */
/** Reasons that are always material — they change what the client is agreeing to. */
const MATERIAL_REASONS: ReadonlySet<RevisionReason> = new Set([
  "scope_change",
  "recommendation_change",
  "option_package_change",
  "milestone_change",
  "source_artifact_change",
  "pricing_input_change",
]);

export interface ReviseInput {
  id: string;
  next: ProposalArtifact;
  reasons: RevisionReason[];
  changeSummary?: string[];
  now: string;
}

/**
 * Create the next immutable version. Returns the NEW artifact plus the revision
 * record; `prior` is never mutated. A material change (by reason OR by content
 * checksum) resets every approval and returns the proposal to `draft`.
 */
export function reviseProposal(prior: ProposalArtifact, input: ReviseInput): { artifact: ProposalArtifact; revision: ProposalRevision } {
  const contentChanged = proposalChecksum(prior) !== proposalChecksum(input.next);
  const material = contentChanged || input.reasons.some((r) => MATERIAL_REASONS.has(r));

  const approvals = material ? resetApprovals(prior.approvals) : prior.approvals;
  const artifact = proposalArtifactSchema.parse({
    ...input.next,
    id: input.id,
    version: prior.version + 1,
    status: material ? "draft" : prior.status, // a material change re-enters review
    approvals,
    approvalRequirementsMet: material ? false : requiredApprovalsMet(approvals),
    checksum: proposalChecksum(input.next),
    createdAt: prior.createdAt,
    updatedAt: input.now,
  });

  const summary = [...(input.changeSummary ?? [])];
  if (contentChanged) summary.push("Proposal content changed (checksum moved).");
  if (material) summary.push("Material change — prior approvals invalidated.");

  const revision = proposalRevisionSchema.parse({
    fromVersion: prior.version,
    toVersion: artifact.version,
    reasons: input.reasons,
    changeSummary: summary,
    material,
    approvalsReset: material ? prior.approvals.map((a) => a.id).sort() : [],
    at: input.now,
  });

  return { artifact, revision };
}

/** True when two artifacts differ in content (ignoring id/version/status/time). Pure. */
export function isMaterialChange(a: ProposalArtifact, b: ProposalArtifact): boolean {
  return proposalChecksum(a) !== proposalChecksum(b);
}
