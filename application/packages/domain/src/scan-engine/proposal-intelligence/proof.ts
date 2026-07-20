/* =============================================================================
 * Case-study & proof inputs (Sprint 11 §11) — PURE.
 *
 * The engine NEVER authors a testimonial, result, or case study. This module only
 * validates REFERENCES to proof the operator already holds, and gates their use:
 * unverified, expired, unavailable, or unapproved proof may not appear in a
 * proposal. `usableProof` is the only path into the artifact.
 * ========================================================================== */

import { caseStudyReferenceSchema, type CaseStudyReference, type ProofVerification } from "@brightloop/schema";

export const UNVERIFIED_LIMITATION = "Proof is not verified; it may not be used in a client-facing proposal.";
export const UNAPPROVED_LIMITATION = "Proof is not approved for use; excluded from the proposal.";

export interface ProofReferenceInput {
  id: string;
  proofType: CaseStudyReference["proofType"];
  comparableBusinessProfile?: Record<string, unknown>;
  relevantOutcome: string;
  source: string;
  verification: ProofVerification;
  approvedForUse: boolean;
  limitations?: string[];
}

/**
 * Record a proof reference, annotating why it may not be usable. The record is
 * always kept (for audit); usability is decided by `isUsableProof`. Pure.
 */
export function buildProofReference(input: ProofReferenceInput): CaseStudyReference {
  const limitations = [...(input.limitations ?? [])];
  if (input.verification !== "verified") limitations.push(UNVERIFIED_LIMITATION);
  if (!input.approvedForUse) limitations.push(UNAPPROVED_LIMITATION);
  if (input.source.trim() === "") limitations.push("No source recorded; proof cannot be traced.");

  return caseStudyReferenceSchema.parse({
    id: input.id,
    proofType: input.proofType,
    comparableBusinessProfile: input.comparableBusinessProfile ?? {},
    relevantOutcome: input.relevantOutcome,
    source: input.source,
    verification: input.verification,
    approvedForUse: input.approvedForUse,
    limitations,
  });
}

/** Proof may be used only when VERIFIED, APPROVED, and traceable to a source. Pure. */
export function isUsableProof(proof: CaseStudyReference): boolean {
  return proof.verification === "verified" && proof.approvedForUse && proof.source.trim() !== "";
}

/** The subset admissible to a client-facing proposal. Pure. */
export function usableProof(proofs: readonly CaseStudyReference[]): CaseStudyReference[] {
  return proofs.filter(isUsableProof).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Proof held but not usable, with the reason — surfaced for the operator. Pure. */
export function rejectedProof(proofs: readonly CaseStudyReference[]): { id: string; reasons: string[] }[] {
  return proofs
    .filter((p) => !isUsableProof(p))
    .map((p) => ({ id: p.id, reasons: p.limitations }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}
