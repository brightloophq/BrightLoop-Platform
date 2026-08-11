/* =============================================================================
 * Prospect Package readiness (Phase C · commercial) — PURE, deterministic.
 *
 * Folds the state of the four package components (report, competitor, proposal,
 * narrative) plus the human review decision into ONE honest package state. It is
 * a read-side computation over already-persisted status — it decides nothing, runs
 * nothing, and invents nothing.
 *
 * Two rules the spec pins down:
 *   • competitor `insufficient_evidence` is a LEGITIMATE terminal outcome and must
 *     NOT block readiness. A proposal draft and a narrative, however, must exist.
 *   • missing pricing must NOT block review readiness (pricing is a separate axis).
 * A generated package is `ready_for_review`, never silently `approved`.
 * ========================================================================== */

/** The coherent per-component status (mirrors the UI CommercialStatus vocabulary). */
export type ComponentStatus = "not_started" | "running" | "ready" | "insufficient_evidence" | "needs_review" | "failed";

/** The recorded human decision (folded from the review event log). */
export type PackageReviewDecision = "pending" | "approved" | "revision_requested" | "rejected";

/** The single package state the command center renders. */
export type ProspectPackageState =
  | "not_started"
  | "running"
  | "blocked"
  | "ready_for_review"
  | "approved"
  | "revision_requested"
  | "rejected";

export interface ProspectPackageInput {
  scanCompleted: boolean;
  reportPresent: boolean;
  /** Competitor is terminal-ok when ready | needs_review | insufficient_evidence. */
  competitor: ComponentStatus;
  /** Proposal requires an actual draft — ready | needs_review (NOT insufficient). */
  proposal: ComponentStatus;
  /** Narrative requires content — ready | needs_review (NOT insufficient). */
  narrative: ComponentStatus;
  /** Any commercial stage dead-lettered. */
  commercialFailed: boolean;
  /** The commercial workflow has been enqueued (so absence = still running, not "never"). */
  commercialEnqueued: boolean;
  reviewDecision: PackageReviewDecision;
  /** All REQUIRED proposal work items carry authoritative admin pricing. */
  pricingComplete: boolean;
}

export interface ProspectPackage {
  state: ProspectPackageState;
  /** A short, honest explanation of the current state for the operator. */
  reason: string;
  /** True only when every required component is present and terminal-good. */
  componentsReady: boolean;
  /**
   * A DERIVED gate (never a persisted state): the proposal is safe to put in front
   * of a prospect. Requires human approval AND complete pricing AND a client
   * narrative AND no commercial failure. Approval alone is NOT client-ready when
   * pricing is still required.
   */
  clientReady: boolean;
}

const TERMINAL = new Set<ComponentStatus>(["ready", "needs_review", "insufficient_evidence"]);
const PRESENT = new Set<ComponentStatus>(["ready", "needs_review"]); // an actual artifact exists

/** Fold component + review state into one package state. Pure. */
export function computeProspectPackage(input: ProspectPackageInput): ProspectPackage {
  const competitorOk = TERMINAL.has(input.competitor); // insufficient_evidence counts as done
  const proposalOk = PRESENT.has(input.proposal); // a draft must exist
  const narrativeOk = PRESENT.has(input.narrative); // content must exist
  const componentsReady = input.scanCompleted && input.reportPresent && competitorOk && proposalOk && narrativeOk;
  // Client-ready is a strict superset of approval: pricing must ALSO be complete and
  // the narrative present. Approval with pricing still required is NOT client-ready.
  const clientReady = input.reviewDecision === "approved" && input.pricingComplete && proposalOk && narrativeOk && !input.commercialFailed;

  // A recorded human decision is authoritative and overrides the generated state.
  if (input.reviewDecision === "approved") return { state: "approved", reason: clientReady ? "The prospect package is approved and client-ready." : "Approved — pricing is still required before this can be sent.", componentsReady, clientReady };
  if (input.reviewDecision === "rejected") return { state: "rejected", reason: "The prospect package was rejected.", componentsReady, clientReady: false };
  if (input.reviewDecision === "revision_requested") return { state: "revision_requested", reason: "A revision was requested for the prospect package.", componentsReady, clientReady: false };

  if (!input.scanCompleted) return { state: "not_started", reason: "The core scan has not completed yet.", componentsReady: false, clientReady: false };
  if (input.commercialFailed) return { state: "blocked", reason: "A commercial stage failed — see the workflow status.", componentsReady, clientReady: false };
  if (componentsReady) return { state: "ready_for_review", reason: "The prospect package is complete and awaiting review.", componentsReady, clientReady: false };

  // Not yet ready. If the workflow is in flight (or a required piece is missing but
  // the workflow was enqueued) that is "running"; otherwise a required piece is
  // genuinely missing/insufficient → blocked when the workflow already finished.
  const anyRunning = input.competitor === "running" || input.proposal === "running" || input.narrative === "running";
  if (anyRunning || (input.commercialEnqueued && !componentsReady && !insufficientTerminal(input))) {
    return { state: "running", reason: "The commercial workflow is still running.", componentsReady, clientReady: false };
  }
  if (insufficientTerminal(input)) {
    return { state: "blocked", reason: blockedReason(input), componentsReady, clientReady: false };
  }
  return { state: "not_started", reason: "The commercial workflow has not run yet.", componentsReady, clientReady: false };
}

/** A required component finished but produced no usable artifact. */
function insufficientTerminal(input: ProspectPackageInput): boolean {
  return (!TERMINAL.has(input.proposal) ? false : !PRESENT.has(input.proposal)) || (!TERMINAL.has(input.narrative) ? false : !PRESENT.has(input.narrative));
}

function blockedReason(input: ProspectPackageInput): string {
  if (input.proposal === "insufficient_evidence") return "The proposal could not be drafted from the available evidence.";
  if (input.narrative === "insufficient_evidence") return "The narrative could not be composed from the available evidence.";
  return "A required package component is not available.";
}
