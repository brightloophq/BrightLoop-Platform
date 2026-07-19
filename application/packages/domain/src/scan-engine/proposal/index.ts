/* =============================================================================
 * L7 · Proposal Engine (PDF 27 §12) — SKELETON.
 *
 * Assembles APPROVED, evidence-linked Moves into a client-ready proposal in six
 * parts. Nothing enters a proposal that isn't backed by an approved move — the
 * proposal inherits the whole evidence trace. The port assembles; a pure guard
 * enforces the "approved + evidence-linked only" rule.
 * ========================================================================== */

import { proposalPartSchema, type ProposalPart, type EngineMove } from "@brightloop/schema";

/** The six canonical proposal parts (PDF 27 §12), in order. */
export const PROPOSAL_PARTS: readonly ProposalPart[] = proposalPartSchema.options;

export interface ProposalInput {
  scanId: string;
  clientId: string | null;
  /** Only APPROVED moves may enter a proposal. */
  approvedMoves: EngineMove[];
}

/**
 * Guard (pure): every move entering a proposal must be evidence-linked. Returns
 * the ids of any move that violates the rule; empty ⇒ safe to assemble. engineMoveSchema
 * already requires ≥1 evidence id, so this catches upstream contract violations.
 */
export function unbackedMoveIds(moves: EngineMove[]): string[] {
  return moves.filter((m) => m.evidenceIds.length === 0).map((m) => m.id);
}

/** Assembles a proposal (timeline, pricing, deliverables, plan, ROI, milestones). */
export interface ProposalEngine {
  assemble(input: ProposalInput): Promise<Record<ProposalPart, unknown>>;
}
