/* =============================================================================
 * Grounding & hallucination guards (AIS-001 §02 invariants) — PURE, no AI.
 *
 * Deterministic validators that REJECT ungrounded output: claims without
 * evidence, fabricated competitors/metrics, unsupported causal claims, certainty
 * beyond evidence, references to Unavailable sources, omitted limitations,
 * malformed citations, stale evidence, and prohibited sensitive claims. Returns
 * structured GroundingRejection[]. This is the anti-hallucination boundary.
 * ========================================================================== */

import type { EvidenceState, FreshnessBand, GroundingRejection, GroundingRejectionReason } from "@brightloop/schema";

/** The maximum certainty (0–100) each evidence state can support. */
const STATE_CEILING: Record<EvidenceState, number> = { observed: 100, estimated: 70, inferred: 50, unavailable: 0 };
const CAUSAL_MIN_CONFIDENCE = 60; // a causal claim needs strong, non-inferred evidence

export interface GroundingClaim {
  id: string;
  statement: string;
  evidenceIds: string[];
  evidenceState: EvidenceState;
  confidenceValue: number; // 0–100
  freshnessBand: FreshnessBand;
  limitations: string[];
  isCausal?: boolean;
  assertsMetric?: boolean;
  referencedCompetitorIds?: string[];
}

export interface EvidenceFacts {
  state: EvidenceState;
  freshnessBand: FreshnessBand;
  confidenceValue: number;
}

export interface GroundingContext {
  evidenceById: Map<string, EvidenceFacts>;
  knownCompetitorIds: Set<string>;
  prohibitedClaims: string[]; // case-insensitive substrings that must not appear
  staleBands?: FreshnessBand[]; // freshness bands treated as too stale (default: ["expired"])
}

/** Validate a single claim against the grounding rules. Returns [] when grounded. */
export function validateGrounding(claim: GroundingClaim, context: GroundingContext): GroundingRejection[] {
  const out: GroundingRejection[] = [];
  const reject = (reason: GroundingRejectionReason, detail: string) => out.push({ reason, claimId: claim.id, detail });
  const stale = new Set<FreshnessBand>(context.staleBands ?? ["expired"]);

  // 1 · no evidence
  if (claim.evidenceIds.length === 0) reject("no_evidence", "claim cites no evidence");

  // 8 · malformed citation (empty id or unknown reference)
  for (const id of claim.evidenceIds) {
    if (id.trim() === "" || !context.evidenceById.has(id)) reject("malformed_citation", `citation '${id}' is empty or unknown`);
  }

  const citedFacts = claim.evidenceIds.map((id) => context.evidenceById.get(id)).filter((f): f is EvidenceFacts => f !== undefined);

  // 6 · references to Unavailable sources
  if (citedFacts.some((f) => f.state === "unavailable")) reject("references_unavailable_source", "claim rests on an Unavailable source");

  // 9 · stale evidence beyond policy
  if (citedFacts.some((f) => stale.has(f.freshnessBand))) reject("stale_evidence", "claim rests on stale evidence");

  // 5 · certainty above what the evidence supports
  const ceiling = citedFacts.length === 0 ? 0 : Math.min(Math.max(...citedFacts.map((f) => STATE_CEILING[f.state])), Math.max(...citedFacts.map((f) => f.confidenceValue)));
  if (claim.confidenceValue > ceiling) reject("certainty_exceeds_evidence", `confidence ${claim.confidenceValue} exceeds evidence ceiling ${ceiling}`);

  // 3 · fabricated metric — a numeric assertion with no evidence
  if (claim.assertsMetric && claim.evidenceIds.length === 0) reject("fabricated_metric", "metric asserted without evidence");

  // 4 · unsupported causal claim — causation needs strong, non-inferred evidence
  if (claim.isCausal && (claim.evidenceIds.length === 0 || claim.evidenceState === "inferred" || claim.confidenceValue < CAUSAL_MIN_CONFIDENCE)) {
    reject("unsupported_causal_claim", "causal claim lacks strong observed evidence");
  }

  // 2 · fabricated competitor — a competitor outside the discovered set
  for (const cid of claim.referencedCompetitorIds ?? []) {
    if (!context.knownCompetitorIds.has(cid)) reject("fabricated_competitor", `competitor '${cid}' is not in the discovered set`);
  }

  // 7 · missing limitations for non-observed claims
  if (claim.evidenceState !== "observed" && claim.limitations.length === 0) reject("missing_limitations", "non-observed claim must state its limitations");

  // 10 · prohibited sensitive claim
  const lower = claim.statement.toLowerCase();
  for (const p of context.prohibitedClaims) {
    if (p.trim() !== "" && lower.includes(p.toLowerCase())) reject("prohibited_sensitive_claim", `claim matches a prohibited pattern`);
  }

  return out;
}

export function isGrounded(claim: GroundingClaim, context: GroundingContext): boolean {
  return validateGrounding(claim, context).length === 0;
}
