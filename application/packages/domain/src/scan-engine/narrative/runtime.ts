/* =============================================================================
 * Narrative Engine — RUNTIME STEP (Phase C · Sprint C10) — PURE PRESENTATION.
 *
 * Transforms already-computed intelligence into structured client-facing
 * narrative sections using DETERMINISTIC sentence templates. It is a presentation
 * layer, never reasoning: it does not discover, infer, recommend, predict, invent,
 * or change any finding, priority, or confidence. It calls no provider and no
 * network. Every block traces to the evidence and artifacts it presents, and its
 * confidence is CARRIED from the source — never computed here.
 *
 * When there is not enough intelligence it emits an explicit UNAVAILABLE snapshot
 * so the runtime continues.
 *
 * ██ INVARIANTS ██
 *   • No creative writing, no marketing language, no randomness, no variable
 *     phrasing — same inputs in → identical narrative + checksum out.
 *   • The narrative never raises a confidence or invents an evidence id.
 * ========================================================================== */

import {
  NARRATIVE_INTELLIGENCE_FORMULA_VERSION,
  narrativeSnapshotSchema,
  type CompetitorIntelligenceSnapshot,
  type NarrativeBlock,
  type NarrativeConfidence,
  type NarrativeSectionKey,
  type NarrativeSnapshot,
  type ProposalIntelligenceSnapshot,
} from "@brightloop/schema";
import { hashContent } from "../evidence/hash.js";
import { confidenceBandFor } from "../competitor-intelligence/confidence.js";

/** A finding/opportunity, reduced to what the narrative presents. */
export interface NarrativePoint {
  title: string;
  evidenceIds: readonly string[];
}

/** The prospect-intelligence presentation source (already computed). */
export interface NarrativeProspectInput {
  executiveOverview: string;
  businessIdentity: string | null;
  indexSummary: string;
  confidence: { value: number; band: string };
  strengths: readonly NarrativePoint[];
  weaknesses: readonly NarrativePoint[];
  opportunities: readonly NarrativePoint[];
  evidenceItemCount: number;
  /** The artifacts these findings were derived from (findings / bundle). */
  sourceArtifacts: readonly string[];
}

export interface NarrativeSynthesisInput {
  scanId: string;
  now: string;
  /** null when there is no prospect intelligence at all → UNAVAILABLE. */
  prospect: NarrativeProspectInput | null;
  competitor: CompetitorIntelligenceSnapshot | null;
  competitorArtifactId?: string | null;
  proposal: ProposalIntelligenceSnapshot | null;
  proposalArtifactId?: string | null;
  /** Presence-only flag: validated provider claims contributed (advisory). */
  providerEnriched?: boolean;
  sourceArtifactIds?: readonly string[];
  idFor?: (prefix: string, index: number) => string;
}

const CONF_ZERO: NarrativeConfidence = { value: 0, band: "very_low" };

function conf(value: number): NarrativeConfidence {
  return { value, band: confidenceBandFor(value) };
}

function carried(source: { value: number; band: string }): NarrativeConfidence {
  // Carry the source confidence verbatim — the narrative computes nothing.
  return { value: source.value, band: confidenceBandFor(source.value) };
}

function uniqSort(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort();
}

/**
 * Run the deterministic Narrative step. Pure — no io, no clock beyond `now`, no
 * randomness. Returns a validated snapshot.
 */
export function synthesizeNarrative(input: NarrativeSynthesisInput): NarrativeSnapshot {
  const { scanId, now, prospect } = input;
  const id = `narr:${scanId}:snapshot`;
  const sourceArtifacts = uniqSort(input.sourceArtifactIds ?? []);
  const idFor = input.idFor ?? ((prefix: string, index: number) => `${prefix}:${scanId}:${index + 1}`);

  // Insufficient intelligence: no prospect intelligence to present at all.
  const hasProspect = prospect !== null && (prospect.strengths.length + prospect.weaknesses.length + prospect.opportunities.length > 0 || prospect.evidenceItemCount > 0);
  if (!hasProspect) {
    return finalize({
      id,
      scanId,
      status: "unavailable",
      reason: "insufficient_intelligence",
      sections: [],
      overall: CONF_ZERO,
      evidenceIds: [],
      sourceArtifacts,
      summary: "Unavailable — insufficient intelligence to present.",
      reviewRequired: false,
      now,
    });
  }

  const p = prospect as NarrativeProspectInput;
  const blocks: NarrativeBlock[] = [];
  let index = 0;
  const add = (key: NarrativeSectionKey, heading: string, paragraphs: string[], evidenceIds: string[], artifacts: string[], confidence: NarrativeConfidence): void => {
    blocks.push({
      id: idFor("narr", index),
      key,
      heading,
      paragraphs: paragraphs.filter((s) => s.trim() !== ""),
      supportingEvidenceIds: uniqSort(evidenceIds),
      supportingArtifacts: uniqSort(artifacts),
      confidence,
      reviewRequired: true,
    });
    index += 1;
  };

  const prospectArtifacts = [...p.sourceArtifacts];
  const findingEvidence = uniqSort([...p.strengths, ...p.weaknesses].flatMap((f) => f.evidenceIds));

  // 1 · Executive Summary — a factual framing, no claims beyond the evidence.
  add(
    "executive_summary",
    "Executive Summary",
    [
      `${p.executiveOverview}`.trim(),
      `${p.indexSummary}`.trim(),
      `${p.strengths.length} strength(s) and ${p.weaknesses.length} area(s) for improvement were identified from verified evidence.`,
    ],
    findingEvidence,
    prospectArtifacts,
    carried(p.confidence),
  );

  // 2 · Current State — strengths and weaknesses, listed, not editorialized.
  add(
    "current_state",
    "Current State",
    [
      p.strengths.length === 0 ? "No standout strengths were evidenced." : `Observed strengths: ${sentenceList(p.strengths.map((s) => s.title))}.`,
      p.weaknesses.length === 0 ? "No material weaknesses were evidenced." : `Areas needing attention: ${sentenceList(p.weaknesses.map((w) => w.title))}.`,
    ],
    findingEvidence,
    prospectArtifacts,
    carried(p.confidence),
  );

  // 3 · Key Opportunities — the evidenced opportunities, reordered only.
  add(
    "key_opportunities",
    "Key Opportunities",
    [
      p.opportunities.length === 0
        ? "No specific opportunities were evidenced from the collected data."
        : `The assessment surfaced ${p.opportunities.length} opportunity area(s): ${sentenceList(p.opportunities.map((o) => o.title))}.`,
    ],
    uniqSort(p.opportunities.flatMap((o) => o.evidenceIds)),
    prospectArtifacts,
    carried(p.confidence),
  );

  // 4 · Competitive Position — presented only when competitor evidence exists.
  const competitorArtifacts = input.competitorArtifactId ? [input.competitorArtifactId] : [];
  if (input.competitor !== null && input.competitor.status === "available") {
    const c = input.competitor;
    add(
      "competitive_position",
      "Competitive Position",
      [
        `Competitive analysis covered ${c.competitors.length} competitor(s); market position: ${c.marketPosition.replace("_", " ")}.`,
        c.differentiators.length === 0 ? "No differentiators were evidenced." : `${c.differentiators.length} differentiator(s) were identified from competitor evidence.`,
      ],
      c.evidenceIds,
      competitorArtifacts,
      carried(c.confidence),
    );
  } else {
    add(
      "competitive_position",
      "Competitive Position",
      ["No verified competitor evidence was available, so competitive position was not assessed."],
      [],
      competitorArtifacts,
      CONF_ZERO,
    );
  }

  // 5 · Recommended Priorities — carried verbatim from Proposal Intelligence.
  const proposalArtifacts = input.proposalArtifactId ? [input.proposalArtifactId] : [];
  if (input.proposal !== null && input.proposal.status === "available") {
    const pr = input.proposal;
    const top = pr.proposals.slice(0, 5).map((x) => `${x.priority}: ${x.title}`);
    add(
      "recommended_priorities",
      "Recommended Priorities",
      [
        `${pr.proposals.length} recommended action(s): ${pr.counts.critical} critical, ${pr.counts.high} high, ${pr.counts.medium} medium, ${pr.counts.low} low.`,
        top.length === 0 ? "" : `Priority actions: ${sentenceList(top)}.`,
      ],
      uniqSort(pr.proposals.flatMap((x) => x.supportingEvidenceIds)),
      proposalArtifacts,
      carried(pr.confidence),
    );
  } else {
    add(
      "recommended_priorities",
      "Recommended Priorities",
      ["Insufficient evidence was available to derive recommended priorities."],
      [],
      proposalArtifacts,
      CONF_ZERO,
    );
  }

  // 6 · Implementation Considerations — sequencing carried from proposals.
  if (input.proposal !== null && input.proposal.status === "available") {
    const pr = input.proposal;
    const blocked = pr.proposals.filter((x) => x.status === "blocked").length;
    add(
      "implementation_considerations",
      "Implementation Considerations",
      [
        blocked === 0
          ? "The recommended actions have no evidenced prerequisites and may be scheduled independently."
          : `${blocked} action(s) have evidenced prerequisites and are sequenced accordingly.`,
      ],
      [],
      proposalArtifacts,
      carried(pr.confidence),
    );
  }

  // 7 · Evidence Summary — provenance, never a new claim.
  add(
    "evidence_summary",
    "Evidence Summary",
    [
      `This assessment is grounded in ${p.evidenceItemCount} verified evidence item(s).`,
      input.providerEnriched
        ? "Validated, evidence-linked provider claims contributed to the findings; no unverified provider text was used."
        : "No provider enrichment was used; the findings are fully deterministic.",
    ],
    findingEvidence,
    prospectArtifacts,
    carried(p.confidence),
  );

  // 8 · Review Notes — always present; the narrative is never client-final.
  const conflicts = (input.competitor?.conflicts ?? 0) + (input.proposal?.conflicts ?? 0);
  add(
    "review_notes",
    "Review Notes",
    [
      "This narrative is a deterministic presentation of structured findings and requires human review before client delivery.",
      conflicts === 0 ? "" : `${conflicts} conflicting signal(s) were detected upstream and reduced the associated confidence.`,
    ],
    [],
    uniqSort([...prospectArtifacts, ...competitorArtifacts, ...proposalArtifacts]),
    CONF_ZERO,
  );

  // Overall confidence is the FLOOR of the sourced sections — a selection, never
  // a fresh computation (unsourced sections carry 0 and are excluded).
  const sourced = blocks.map((b) => b.confidence.value).filter((v) => v > 0);
  const overallValue = sourced.length === 0 ? 0 : Math.min(...sourced);
  const evidenceIds = uniqSort(blocks.flatMap((b) => b.supportingEvidenceIds));
  const summary = `Narrative with ${blocks.length} section(s) presenting ${p.strengths.length + p.weaknesses.length} finding(s) and ${p.opportunities.length} opportunity area(s).`;

  return finalize({
    id,
    scanId,
    status: "available",
    reason: null,
    sections: blocks,
    overall: conf(overallValue),
    evidenceIds,
    sourceArtifacts,
    summary: summary.slice(0, 400),
    reviewRequired: true,
    now,
  });
}

/** Join titles into a deterministic, readable list. */
function sentenceList(items: readonly string[]): string {
  const trimmed = items.map((s) => s.trim()).filter((s) => s !== "");
  if (trimmed.length === 0) return "";
  if (trimmed.length === 1) return trimmed[0]!;
  return `${trimmed.slice(0, -1).join(", ")} and ${trimmed[trimmed.length - 1]}`;
}

interface FinalizeInput {
  id: string;
  scanId: string;
  status: "available" | "unavailable";
  reason: "insufficient_intelligence" | null;
  sections: NarrativeBlock[];
  overall: NarrativeConfidence;
  evidenceIds: string[];
  sourceArtifacts: string[];
  summary: string;
  reviewRequired: boolean;
  now: string;
}

function finalize(input: FinalizeInput): NarrativeSnapshot {
  const body = {
    id: input.id,
    scanId: input.scanId,
    status: input.status,
    reason: input.reason,
    sections: input.sections,
    confidence: input.overall,
    evidenceIds: input.evidenceIds,
    summary: input.summary,
    reviewRequired: input.reviewRequired,
    formulaVersion: NARRATIVE_INTELLIGENCE_FORMULA_VERSION,
  };
  // Content-addressed on PRESENTATION content only. Exclude sourceArtifacts,
  // generatedAt, checksum AND every per-section `supportingArtifacts` (all volatile
  // runtime artifact ids — lineage, not content), so identical intelligence hashes
  // identically regardless of artifact-id counters or clock.
  const hashable = { ...body, sections: body.sections.map(({ supportingArtifacts: _drop, ...rest }) => rest) };
  const checksum = hashContent(hashable);
  return narrativeSnapshotSchema.parse({
    ...body,
    sourceArtifacts: input.sourceArtifacts,
    generatedAt: input.now,
    checksum,
  });
}
