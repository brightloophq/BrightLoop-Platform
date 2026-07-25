/* =============================================================================
 * Proposal Intelligence — RUNTIME STEP (Phase C · Sprint C9) — PURE.
 *
 * Converts evidence-backed recommendation candidates into STRUCTURED proposal
 * objects. It groups, dedups, merges overlapping recommendations, prioritizes,
 * identifies prerequisites, estimates effort, attaches evidence, and computes a
 * confidence ceiled by the backing evidence. It writes NO prose — no marketing
 * copy, no narrative, no AI generation. It calls no provider and no network.
 *
 * When evidence is insufficient it emits an explicit UNAVAILABLE snapshot so the
 * runtime continues safely.
 *
 * ██ INVARIANTS ██
 *   • Every proposal references KNOWN supporting evidence ids (≥1).
 *   • Priority and effort derive from evidence-backed signals, not opinion.
 *   • Confidence is CEILED by the minimum backing-evidence confidence and only
 *     ever reduced (by conflicting findings). Never inflated.
 *   • Same inputs in → identical snapshot + checksum out.
 * ========================================================================== */

import {
  PROPOSAL_INTELLIGENCE_FORMULA_VERSION,
  proposalIntelligenceSnapshotSchema,
  type ProposalEffort,
  type ProposalImpact,
  type ProposalIntelligenceSnapshot,
  type ProposalItem,
  type ProposalPriority,
} from "@brightloop/schema";
import { hashContent } from "../evidence/hash.js";
import { confidenceBandFor } from "../competitor-intelligence/confidence.js";

/** Confidence penalty applied to a proposal whose category had conflicting findings. */
export const PROPOSAL_CONFLICT_PENALTY = 10;

/** A recommendation candidate, reduced to what proposal synthesis needs. */
export interface ProposalCandidateInput {
  id: string;
  title: string;
  category: string;
  problemStatement: string;
  proposedAction: string;
  affectedDimensions: readonly string[];
  /** Evidence-backed impact (0–100). */
  impact: number;
  /** Evidence-backed effort (0–100). */
  effort: number;
  evidenceIds: readonly string[];
  riskIds: readonly string[];
  /** Advisory candidate confidence (0–100). */
  confidence: number;
  limitations: readonly string[];
}

export interface ProposalSynthesisInput {
  scanId: string;
  candidates: readonly ProposalCandidateInput[];
  /** Categories that carried BOTH a strength and a weakness — conflicting findings. */
  conflictedCategories?: readonly string[];
  /** evidenceId → confidence value (0–100). The confidence CEILING per proposal. */
  evidenceConfidence?: ReadonlyMap<string, number>;
  sourceArtifactIds?: readonly string[];
  now: string;
  /** Deterministic id factory; defaults to `prop:<scanId>:<index>`. */
  idFor?: (prefix: string, index: number) => string;
}

interface Merged {
  key: string;
  title: string;
  category: string;
  problem: string;
  solution: string;
  affectedDimensions: string[];
  impact: number;
  effort: number;
  candidateConfidence: number;
  evidenceIds: string[];
  riskIds: string[];
  limitations: string[];
  seedId: string; // smallest candidate id — deterministic tie-break for text
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Run the deterministic Proposal Intelligence step. Pure — no io, no clock beyond
 * `now`, no randomness. Returns a validated snapshot.
 */
export function synthesizeProposalIntelligence(input: ProposalSynthesisInput): ProposalIntelligenceSnapshot {
  const { scanId, now } = input;
  const id = `prop:${scanId}:snapshot`;
  const sourceArtifacts = [...new Set(input.sourceArtifactIds ?? [])].sort();
  const conflicted = new Set(input.conflictedCategories ?? []);
  const evConf = input.evidenceConfidence ?? new Map<string, number>();

  // Only candidates with at least one evidence id may propose work.
  const usable = input.candidates.filter((c) => c.evidenceIds.length > 0);

  if (usable.length === 0) {
    return finalize({
      id,
      scanId,
      status: "unavailable",
      reason: "insufficient_evidence",
      proposals: [],
      conflicts: 0,
      overallConfidence: 0,
      evidenceIds: [],
      sourceArtifacts,
      summary: "Unavailable — insufficient evidence to propose work.",
      reviewRequired: false,
      now,
    });
  }

  // Group + dedup + merge overlapping recommendations by category + solution.
  const byKey = new Map<string, Merged>();
  for (const c of usable) {
    const key = `${c.category}|${norm(c.proposedAction)}`;
    const evidenceIds = [...new Set(c.evidenceIds)].sort();
    const prior = byKey.get(key);
    if (prior === undefined) {
      byKey.set(key, {
        key,
        title: c.title,
        category: c.category,
        problem: c.problemStatement,
        solution: c.proposedAction,
        affectedDimensions: [...new Set(c.affectedDimensions)].sort(),
        impact: c.impact,
        effort: c.effort,
        candidateConfidence: c.confidence,
        evidenceIds,
        riskIds: [...new Set(c.riskIds)].sort(),
        limitations: [...new Set(c.limitations)],
        seedId: c.id,
      });
    } else {
      prior.impact = Math.max(prior.impact, c.impact);
      prior.effort = Math.max(prior.effort, c.effort);
      prior.candidateConfidence = Math.min(prior.candidateConfidence, c.confidence);
      prior.affectedDimensions = [...new Set([...prior.affectedDimensions, ...c.affectedDimensions])].sort();
      prior.evidenceIds = [...new Set([...prior.evidenceIds, ...evidenceIds])].sort();
      prior.riskIds = [...new Set([...prior.riskIds, ...c.riskIds])].sort();
      prior.limitations = [...new Set([...prior.limitations, ...c.limitations])];
      // Deterministic text: keep the fields of the smallest candidate id.
      if (c.id < prior.seedId) {
        prior.seedId = c.id;
        prior.title = c.title;
        prior.problem = c.problemStatement;
        prior.solution = c.proposedAction;
      }
    }
  }

  // Score each merged proposal (priority, effort, impact, confidence).
  interface Scored extends Merged {
    priority: ProposalPriority;
    priorityRank: number;
    effortBand: ProposalEffort;
    businessImpact: ProposalImpact;
    confidenceValue: number;
    conflicted: boolean;
  }
  const scored: Scored[] = [...byKey.values()].map((m) => {
    const ceiling = evidenceCeiling(m.evidenceIds, evConf, m.candidateConfidence);
    const base = Math.min(m.candidateConfidence, ceiling);
    const isConflicted = conflicted.has(m.category);
    const confidenceValue = Math.max(0, base - (isConflicted ? PROPOSAL_CONFLICT_PENALTY : 0));
    const priority = priorityFor(m.impact, m.riskIds.length);
    return {
      ...m,
      priority,
      priorityRank: PRIORITY_RANK[priority],
      effortBand: effortFor(m.effort),
      businessImpact: impactFor(m.impact),
      confidenceValue,
      conflicted: isConflicted,
    };
  });

  // Display order: priority (critical→low), then lighter effort first, then id.
  scored.sort((a, b) => b.priorityRank - a.priorityRank || a.effort - b.effort || (a.seedId < b.seedId ? -1 : a.seedId > b.seedId ? 1 : 0));

  // Assign deterministic ids in final order, then compute prerequisite deps.
  const ids = scored.map((_, i) => input.idFor?.("prop", i) ?? `prop:${scanId}:${i + 1}`);
  const proposals: ProposalItem[] = scored.map((s, i) => {
    // A prerequisite shares an affected dimension AND is strictly lighter effort.
    const dependencies = scored
      .map((o, j) => ({ o, j }))
      .filter(({ o, j }) => j !== i && o.effort < s.effort && o.affectedDimensions.some((d) => s.affectedDimensions.includes(d)))
      .map(({ j }) => ids[j]!)
      .sort();
    const risks = [
      ...s.limitations.map((l) => l.slice(0, 300)),
      ...s.riskIds.map((r) => `Linked risk finding: ${r}`.slice(0, 300)),
    ];
    return {
      id: ids[i]!,
      title: s.title.slice(0, 200),
      problem: s.problem.slice(0, 2000),
      recommendedSolution: s.solution.slice(0, 2000),
      businessImpact: s.businessImpact,
      priority: s.priority,
      estimatedEffort: s.effortBand,
      dependencies,
      risks,
      confidence: { value: s.confidenceValue, band: confidenceBandFor(s.confidenceValue) },
      supportingEvidenceIds: s.evidenceIds,
      reviewRequired: true,
      status: dependencies.length > 0 ? "blocked" : "ready",
    };
  });

  const conflicts = scored.filter((s) => s.conflicted).length;
  const overallConfidence = proposals.length === 0 ? 0 : Math.min(...proposals.map((p) => p.confidence.value));
  const evidenceIds = [...new Set(proposals.flatMap((p) => p.supportingEvidenceIds))].sort();
  const counts = countByPriority(proposals);
  const summary =
    `${proposals.length} proposal(s): ${counts.critical} critical, ${counts.high} high, ` +
    `${counts.medium} medium, ${counts.low} low; ${conflicts} conflict(s).`;

  return finalize({
    id,
    scanId,
    status: "available",
    reason: null,
    proposals,
    conflicts,
    overallConfidence,
    evidenceIds,
    sourceArtifacts,
    summary: summary.slice(0, 400),
    reviewRequired: true,
    now,
  });
}

const PRIORITY_RANK: Record<ProposalPriority, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/** Priority from evidence-backed impact, elevated when evidence-linked risks exist. */
function priorityFor(impact: number, riskCount: number): ProposalPriority {
  const score = Math.min(100, impact + (riskCount > 0 ? 10 : 0));
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function effortFor(effort: number): ProposalEffort {
  if (!Number.isFinite(effort)) return "unknown";
  if (effort <= 33) return "small";
  if (effort <= 66) return "medium";
  return "large";
}

function impactFor(impact: number): ProposalImpact {
  if (impact >= 67) return "high";
  if (impact >= 34) return "moderate";
  return "low";
}

/** The minimum backing-evidence confidence (the ceiling), or the advisory value. */
function evidenceCeiling(evidenceIds: readonly string[], evConf: ReadonlyMap<string, number>, fallback: number): number {
  const known = evidenceIds.map((id) => evConf.get(id)).filter((v): v is number => typeof v === "number");
  if (known.length === 0) return fallback;
  return Math.min(...known);
}

function countByPriority(proposals: readonly ProposalItem[]): { critical: number; high: number; medium: number; low: number } {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const p of proposals) counts[p.priority] += 1;
  return counts;
}

interface FinalizeInput {
  id: string;
  scanId: string;
  status: "available" | "unavailable";
  reason: "insufficient_evidence" | null;
  proposals: ProposalItem[];
  conflicts: number;
  overallConfidence: number;
  evidenceIds: string[];
  sourceArtifacts: string[];
  summary: string;
  reviewRequired: boolean;
  now: string;
}

function finalize(input: FinalizeInput): ProposalIntelligenceSnapshot {
  const body = {
    id: input.id,
    scanId: input.scanId,
    status: input.status,
    reason: input.reason,
    proposals: input.proposals,
    counts: countByPriority(input.proposals),
    conflicts: input.conflicts,
    confidence: { value: input.overallConfidence, band: confidenceBandFor(input.overallConfidence) },
    evidenceIds: input.evidenceIds,
    summary: input.summary,
    reviewRequired: input.reviewRequired,
    formulaVersion: PROPOSAL_INTELLIGENCE_FORMULA_VERSION,
  };
  // Content-addressed: exclude sourceArtifacts / generatedAt / checksum so
  // identical inputs hash identically regardless of artifact ids or clock.
  const checksum = hashContent(body);
  return proposalIntelligenceSnapshotSchema.parse({
    ...body,
    sourceArtifacts: input.sourceArtifacts,
    generatedAt: input.now,
    checksum,
  });
}
