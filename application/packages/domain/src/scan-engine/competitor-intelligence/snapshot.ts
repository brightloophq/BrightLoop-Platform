/* =============================================================================
 * Snapshots & changesets (Sprint 10 §16 · AIS-005 §08) — PURE.
 *
 * An immutable, checksummed point-in-time read of the competitive set, plus a pure
 * diff between two snapshots so the client sees trajectory, not just a state.
 * Deterministic: the checksum is computed over canonical JSON of the snapshot's
 * content (excluding the checksum itself), so identical content always hashes the
 * same. No persistence — the caller decides what to keep.
 * ========================================================================== */

import {
  COMPETITOR_FORMULA_VERSION,
  COMPETITOR_SCHEMA_VERSION,
  competitorChangesetSchema,
  competitorSnapshotSchema,
  type BenchmarkDimension,
  type CompetitiveGap,
  type CompetitorChange,
  type CompetitorChangeset,
  type CompetitorRanking,
  type CompetitorSetConfidence,
  type CompetitorSnapshot,
  type EngineCompetitorBenchmark,
  type GapType,
  type MarketPosition,
} from "@brightloop/schema";
import { hashContent } from "../evidence/hash.js";
import { clientBenchmark } from "./benchmarks.js";

export interface SnapshotInput {
  id: string;
  scanId: string;
  clientId: string | null;
  ranking: CompetitorRanking;
  benchmarks: readonly EngineCompetitorBenchmark[];
  dimensions: readonly BenchmarkDimension[];
  gaps: readonly CompetitiveGap[];
  marketPosition?: MarketPosition | null;
  setConfidence?: CompetitorSetConfidence | null;
  sourceArtifactIds?: string[];
  now: string;
}

/** Build an immutable, checksummed competitor snapshot. Pure. */
export function createCompetitorSnapshot(input: SnapshotInput): CompetitorSnapshot {
  const selectedCompetitorIds = input.ranking.selected.map((s) => s.candidateId);
  const rejectedCandidateIds = input.ranking.rejected.map((r) => r.candidateId).sort();

  const benchmarkSummary: Record<string, number> = {};
  for (const dimension of [...input.dimensions].sort()) {
    const client = clientBenchmark(input.benchmarks, dimension);
    if (client !== null && client.available && client.normalizedScore !== null) benchmarkSummary[dimension] = client.normalizedScore;
  }

  const gapSummary: Record<string, GapType> = {};
  for (const g of [...input.gaps].sort((a, b) => (a.dimension < b.dimension ? -1 : 1))) gapSummary[g.dimension] = g.type;

  const content = {
    scanId: input.scanId,
    clientId: input.clientId,
    selectedCompetitorIds,
    rejectedCandidateIds,
    benchmarkSummary,
    gapSummary,
    marketPosition: input.marketPosition ?? null,
    setConfidence: input.setConfidence ?? null,
  };

  return competitorSnapshotSchema.parse({
    id: input.id,
    ...content,
    checksum: hashContent(content), // excludes id/timestamp — content-addressed
    generatedAt: input.now,
    sourceArtifactIds: input.sourceArtifactIds ?? [],
    formulaVersions: { schema: COMPETITOR_SCHEMA_VERSION, formula: COMPETITOR_FORMULA_VERSION },
  });
}

/** Points of benchmark movement below which a change is not reported. */
export const BENCHMARK_CHANGE_EPSILON = 1;
/** Confidence points below which a set-confidence change is not reported. */
export const CONFIDENCE_CHANGE_EPSILON = 5;

/**
 * Diff two snapshots. Emits added/removed competitors, rank moves, benchmark
 * movement, gap widening/narrowing, advantage gained/lost, and confidence shifts.
 * Deterministic — changes are emitted in a fixed category + id order.
 */
export function compareSnapshots(from: CompetitorSnapshot, to: CompetitorSnapshot): CompetitorChangeset {
  const changes: CompetitorChange[] = [];

  // ---- set membership
  const before = from.selectedCompetitorIds;
  const after = to.selectedCompetitorIds;
  for (const id of after.filter((x) => !before.includes(x)).sort()) {
    changes.push({ kind: "competitor_added", subjectId: id, dimension: null, before: null, after: id, detail: `${id} entered the competitive set` });
  }
  for (const id of before.filter((x) => !after.includes(x)).sort()) {
    changes.push({ kind: "competitor_removed", subjectId: id, dimension: null, before: id, after: null, detail: `${id} left the competitive set` });
  }

  // ---- rank moves among those present in both
  for (const id of after.filter((x) => before.includes(x)).sort()) {
    const b = before.indexOf(id) + 1;
    const a = after.indexOf(id) + 1;
    if (a !== b) changes.push({ kind: "rank_changed", subjectId: id, dimension: null, before: b, after: a, detail: `${id} moved from rank ${b} to ${a}` });
  }

  // ---- benchmark movement
  for (const dimension of [...new Set([...Object.keys(from.benchmarkSummary), ...Object.keys(to.benchmarkSummary)])].sort()) {
    const b = from.benchmarkSummary[dimension];
    const a = to.benchmarkSummary[dimension];
    if (b === undefined || a === undefined) continue; // appearing/disappearing evidence is a gap change, not a value change
    if (Math.abs(a - b) >= BENCHMARK_CHANGE_EPSILON) {
      changes.push({ kind: "benchmark_changed", subjectId: dimension, dimension: dimension as BenchmarkDimension, before: b, after: a, detail: `${dimension} moved ${b} → ${a}` });
    }
  }

  // ---- gap transitions
  for (const dimension of [...new Set([...Object.keys(from.gapSummary), ...Object.keys(to.gapSummary)])].sort()) {
    const b = from.gapSummary[dimension];
    const a = to.gapSummary[dimension];
    if (b === undefined || a === undefined || a === b) continue;
    const dim = dimension as BenchmarkDimension;
    // Conditions are INDEPENDENT, not exclusive: an advantage → deficit move is both
    // an advantage lost and a gap widened, and the changeset should surface both.
    if (b === "advantage" && a !== "advantage") changes.push({ kind: "advantage_lost", subjectId: dimension, dimension: dim, before: b, after: a, detail: `${dimension}: advantage lost (${b} → ${a})` });
    if (a === "advantage" && b !== "advantage") changes.push({ kind: "advantage_gained", subjectId: dimension, dimension: dim, before: b, after: a, detail: `${dimension}: advantage gained (${b} → ${a})` });
    if (a === "deficit" && b !== "deficit") changes.push({ kind: "gap_widened", subjectId: dimension, dimension: dim, before: b, after: a, detail: `${dimension}: fell to a deficit (${b} → ${a})` });
    if (b === "deficit" && a !== "deficit") changes.push({ kind: "gap_narrowed", subjectId: dimension, dimension: dim, before: b, after: a, detail: `${dimension}: recovered from a deficit (${b} → ${a})` });
  }

  // ---- set confidence
  const cb = from.setConfidence?.score ?? null;
  const ca = to.setConfidence?.score ?? null;
  if (cb !== null && ca !== null && Math.abs(ca - cb) >= CONFIDENCE_CHANGE_EPSILON) {
    changes.push({ kind: "confidence_changed", subjectId: null, dimension: null, before: cb, after: ca, detail: `competitor-set confidence ${cb} → ${ca}` });
  }

  return competitorChangesetSchema.parse({ fromSnapshotId: from.id, toSnapshotId: to.id, changes });
}
