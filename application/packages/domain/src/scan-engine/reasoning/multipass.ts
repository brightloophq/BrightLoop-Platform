/* =============================================================================
 * Multi-pass reasoning contracts (Sprint 6 §08 · AIS-001 §06/§07) — PURE.
 *
 * The bounded pass sequence — primary → critic → validation → synthesis — plus
 * consensus/disagreement metadata over a set of pass verdicts. Optional
 * alternative-hypothesis + counter-argument pairing. NO hidden reasoning text:
 * only structured verdicts and their agreement math cross the boundary.
 * ========================================================================== */

import type { ConsensusMetadata, ReasoningPass } from "@brightloop/schema";

/** Canonical pass order. A pass may only run once its predecessor is complete. */
export const REASONING_PASS_ORDER: readonly ReasoningPass[] = ["primary", "critic", "validation", "synthesis"];

/** The pass after `pass`, or null after `synthesis` (the last). Pure. */
export function nextPass(pass: ReasoningPass): ReasoningPass | null {
  const i = REASONING_PASS_ORDER.indexOf(pass);
  if (i < 0 || i >= REASONING_PASS_ORDER.length - 1) return null;
  return REASONING_PASS_ORDER[i + 1]!;
}

/** A transition is legal iff `to` immediately follows `from`. Pure. */
export function canAdvancePass(from: ReasoningPass, to: ReasoningPass): boolean {
  return nextPass(from) === to;
}

export function isPassComplete(pass: ReasoningPass): boolean {
  return pass === "synthesis";
}

/** One agent/pass verdict on a claim: who voted, and whether they agreed. */
export interface PassVerdict {
  id: string; // pass or agent id
  agree: boolean;
}

/**
 * Compute consensus over a set of verdicts. `agreement` is the share that agree
 * (0 when there are no verdicts); `resolved` is true once a strict majority agree.
 * Ids are partitioned into agreeing/disagreeing, each sorted for determinism. Pure.
 */
export function computeConsensus(verdicts: readonly PassVerdict[]): ConsensusMetadata {
  const agreeing = verdicts.filter((v) => v.agree).map((v) => v.id).sort();
  const disagreeing = verdicts.filter((v) => !v.agree).map((v) => v.id).sort();
  const total = verdicts.length;
  const agreement = total === 0 ? 0 : agreeing.length / total;
  return { agreement, agreeing, disagreeing, resolved: agreeing.length * 2 > total };
}

/** A claim is contested when at least one verdict disagrees. Pure. */
export function isContested(consensus: ConsensusMetadata): boolean {
  return consensus.disagreeing.length > 0;
}
