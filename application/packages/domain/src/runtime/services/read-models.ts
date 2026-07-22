/* =============================================================================
 * Runtime READ MODELS (Phase B · Sprint 13C §16) — PROJECTIONS ONLY.
 *
 * These shape persisted rows for operators. They contain NO domain logic: no
 * scoring, no confidence maths, no severity ranking, no recommendation ordering.
 * All of that was decided in Phase A and is already baked into the envelopes
 * being read back. A read model that re-derived any of it would create a second,
 * silently divergent source of truth.
 *
 * The projection functions are PURE — rows in, view out — so they are trivially
 * testable and can run wherever the rows come from.
 * ========================================================================== */

import type {
  RuntimeArtifact,
  RuntimeCheckpoint,
  RuntimeCompetitorSnapshot,
  RuntimeEvent,
  RuntimeFinding,
  RuntimeNarrativeVersion,
  RuntimeProposalVersion,
  RuntimeProviderAttempt,
  RuntimeQueueJob,
  RuntimeReasoningJob,
  RuntimeRecommendation,
  RuntimeRun,
  RuntimeStage,
} from "@brightloop/schema";

/* ---- 1 · dashboard ------------------------------------------------------------ */
export interface RuntimeDashboardView {
  totalRuns: number;
  active: number;
  completed: number;
  failed: number;
  cancelled: number;
  blocked: number;
  queueDepth: number;
  inFlightJobs: number;
  deadLettered: number;
}

const ACTIVE_RUN_STATUSES = new Set<RuntimeRun["status"]>([
  "pending", "discovering", "ingesting_evidence", "assembling_graph", "planning_reasoning",
  "executing_reasoning", "validating_results", "synthesizing_findings", "building_recommendations",
  "preparing_report",
]);

export function dashboardView(runs: readonly RuntimeRun[], jobs: readonly RuntimeQueueJob[]): RuntimeDashboardView {
  return {
    totalRuns: runs.length,
    active: runs.filter((r) => ACTIVE_RUN_STATUSES.has(r.status)).length,
    completed: runs.filter((r) => r.status === "completed").length,
    failed: runs.filter((r) => r.status === "failed").length,
    cancelled: runs.filter((r) => r.status === "cancelled").length,
    blocked: runs.filter((r) => r.status === "blocked").length,
    queueDepth: jobs.filter((j) => j.status === "queued").length,
    inFlightJobs: jobs.filter((j) => j.status === "leased").length,
    deadLettered: jobs.filter((j) => j.status === "dead_letter").length,
  };
}

/* ---- 2 · active runs ------------------------------------------------------------ */
export interface ActiveRunRow {
  runId: string;
  clientId: string | null;
  scanId: string;
  status: RuntimeRun["status"];
  currentStage: string | null;
  startedAt: string | null;
  deadline: string | null;
  pastDeadline: boolean;
}

export function activeRunsView(runs: readonly RuntimeRun[], now: string): ActiveRunRow[] {
  return runs
    .filter((r) => ACTIVE_RUN_STATUSES.has(r.status) && !r.cancelled)
    .map((r) => ({
      runId: r.id,
      clientId: r.clientId,
      scanId: r.scanId,
      status: r.status,
      currentStage: r.currentStage,
      startedAt: r.startedAt,
      deadline: r.deadline,
      pastDeadline: r.deadline !== null && now >= r.deadline,
    }))
    .sort((a, b) => a.runId.localeCompare(b.runId));
}

/* ---- 3 · run timeline ------------------------------------------------------------ */
export interface RunTimelineEntry {
  stage: string;
  status: RuntimeStage["status"];
  attempt: number;
  at: string;
  error: string | null;
}

/**
 * Lifecycle precedence within one stage+attempt.
 *
 * Timestamps ALONE cannot order these: a stage writes `running` and then
 * `completed` routinely inside the same millisecond, and tied rows come back
 * from Postgres in arbitrary order. Ranking by lifecycle position makes the
 * ordering deterministic regardless of how the rows arrive.
 *
 * (An in-memory store hides this — V8's stable sort happens to preserve
 * insertion order — which is exactly why the live suite is worth running.)
 */
const STATUS_RANK: Record<RuntimeStage["status"], number> = {
  pending: 0,
  running: 1,
  skipped: 2,
  cancelled: 3,
  failed: 4,
  completed: 5,
};

/** Chronological, then by stage, then by lifecycle position. Fully deterministic. */
export function runTimelineView(stages: readonly RuntimeStage[]): RunTimelineEntry[] {
  return [...stages]
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) ||
        a.stage.localeCompare(b.stage) ||
        a.attempt - b.attempt ||
        STATUS_RANK[a.status] - STATUS_RANK[b.status],
    )
    .map((s) => ({
      stage: s.stage,
      status: s.status,
      attempt: s.attempt,
      at: s.createdAt,
      error: s.lastError,
    }));
}

/* ---- 4 · stage status -------------------------------------------------------------- */
export interface StageStatusRow {
  stage: string;
  status: RuntimeStage["status"];
  attempts: number;
  lastError: string | null;
}

/**
 * The LATEST transition per stage — the current picture, not the history.
 *
 * Ordered by (createdAt, attempt, lifecycle rank). The last two tiebreaks are
 * load-bearing, not defensive: without them a `running` row written in the same
 * millisecond as its `completed` row can win the race and report a finished
 * stage as still in flight.
 */
export function stageStatusView(stages: readonly RuntimeStage[]): StageStatusRow[] {
  const latest = new Map<string, RuntimeStage>();
  const ordered = [...stages].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) ||
      a.attempt - b.attempt ||
      STATUS_RANK[a.status] - STATUS_RANK[b.status],
  );
  for (const s of ordered) latest.set(s.stage, s);
  return [...latest.values()]
    .map((s) => ({
      stage: s.stage,
      status: s.status,
      attempts: s.attempt + 1,
      lastError: s.lastError,
    }))
    .sort((a, b) => a.stage.localeCompare(b.stage));
}

/* ---- 5 · queue status ---------------------------------------------------------------- */
export interface QueueStatusView {
  queued: number;
  leased: number;
  completed: number;
  failed: number;
  cancelled: number;
  deadLetter: number;
  byJobType: Record<string, number>;
  /** Leases whose expiry has passed — recoverable work, not lost work. */
  expiredLeases: number;
}

export function queueStatusView(jobs: readonly RuntimeQueueJob[], now: string): QueueStatusView {
  const byJobType: Record<string, number> = {};
  for (const j of jobs) byJobType[j.jobType] = (byJobType[j.jobType] ?? 0) + 1;

  return {
    queued: jobs.filter((j) => j.status === "queued").length,
    leased: jobs.filter((j) => j.status === "leased").length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
    cancelled: jobs.filter((j) => j.status === "cancelled").length,
    deadLetter: jobs.filter((j) => j.status === "dead_letter").length,
    byJobType,
    expiredLeases: jobs.filter((j) => j.status === "leased" && j.leaseExpiresAt !== null && now >= j.leaseExpiresAt).length,
  };
}

/* ---- 6 · artifact summary ---------------------------------------------------------------- */
export interface ArtifactSummaryRow {
  kind: string;
  versions: number;
  latestVersion: number;
  latestChecksum: string;
  validationStatus: RuntimeArtifact["validationStatus"];
}

export function artifactSummaryView(artifacts: readonly RuntimeArtifact[]): ArtifactSummaryRow[] {
  const byKind = new Map<string, RuntimeArtifact[]>();
  for (const a of artifacts) byKind.set(a.kind, [...(byKind.get(a.kind) ?? []), a]);

  return [...byKind.entries()]
    .map(([kind, list]) => {
      const latest = [...list].sort((a, b) => b.version - a.version)[0]!;
      return {
        kind,
        versions: list.length,
        latestVersion: latest.version,
        latestChecksum: latest.checksum,
        validationStatus: latest.validationStatus,
      };
    })
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

/* ---- 7 · evidence summary ------------------------------------------------------------------ */
export interface EvidenceSummaryView {
  evidenceArtifacts: number;
  latestBundleChecksum: string | null;
  graphSnapshotChecksum: string | null;
  /** True once a validated bundle exists — the gate reasoning depends on. */
  evidenceValidated: boolean;
}

export function evidenceSummaryView(artifacts: readonly RuntimeArtifact[]): EvidenceSummaryView {
  const latestOf = (kind: string) =>
    [...artifacts].filter((a) => a.kind === kind).sort((a, b) => b.version - a.version)[0] ?? null;

  const bundle = latestOf("evidence_bundle");
  const snapshot = latestOf("graph_snapshot");
  return {
    evidenceArtifacts: artifacts.filter((a) => a.kind.startsWith("evidence_")).length,
    latestBundleChecksum: bundle?.checksum ?? null,
    graphSnapshotChecksum: snapshot?.checksum ?? null,
    evidenceValidated: bundle !== null && bundle.validationStatus === "valid",
  };
}

/* ---- 8 · recommendation summary --------------------------------------------------------------- */
export interface RecommendationSummaryView {
  total: number;
  byTier: Record<string, number>;
  /** Highest-priority first; priority was decided in Phase A, not here. */
  topPriorityIds: string[];
}

export function recommendationSummaryView(recommendations: readonly RuntimeRecommendation[], limit = 5): RecommendationSummaryView {
  const byTier: Record<string, number> = {};
  for (const r of recommendations) {
    const tier = r.tier ?? "untiered";
    byTier[tier] = (byTier[tier] ?? 0) + 1;
  }
  const topPriorityIds = [...recommendations]
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((r) => r.id);

  return { total: recommendations.length, byTier, topPriorityIds };
}

/* ---- 9 · finding summary (evidence-linked) ------------------------------------------------------ */
export interface FindingSummaryView {
  total: number;
  bySeverity: Record<string, number>;
  byDomain: Record<string, number>;
}

export function findingSummaryView(findings: readonly RuntimeFinding[]): FindingSummaryView {
  const bySeverity: Record<string, number> = {};
  const byDomain: Record<string, number> = {};
  for (const f of findings) {
    const severity = f.severity ?? "unclassified";
    const domain = f.domain ?? "unassigned";
    bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;
    byDomain[domain] = (byDomain[domain] ?? 0) + 1;
  }
  return { total: findings.length, bySeverity, byDomain };
}

/* ---- 10 · competitor summary ---------------------------------------------------------------------- */
export interface CompetitorSummaryView {
  snapshots: number;
  latestVersion: number | null;
  competitorCount: number | null;
  latestChecksum: string | null;
}

export function competitorSummaryView(snapshots: readonly RuntimeCompetitorSnapshot[]): CompetitorSummaryView {
  const latest = [...snapshots].sort((a, b) => b.version - a.version)[0] ?? null;
  return {
    snapshots: snapshots.length,
    latestVersion: latest?.version ?? null,
    competitorCount: latest?.competitorCount ?? null,
    latestChecksum: latest?.checksum ?? null,
  };
}

/* ---- 11 · proposal summary -------------------------------------------------------------------------- */
export interface VersionLineageView {
  versions: number;
  latestVersion: number | null;
  latestStatus: string | null;
  /** Oldest → newest, following `supersedesId`. Proves lineage was preserved. */
  lineage: string[];
}

export function proposalSummaryView(versions: readonly RuntimeProposalVersion[]): VersionLineageView {
  return lineageOf(versions);
}

/* ---- 12 · narrative summary --------------------------------------------------------------------------- */
/** Narratives are versioned PER AUDIENCE, so each audience gets its own chain. */
export function narrativeSummaryView(versions: readonly RuntimeNarrativeVersion[]): Record<string, VersionLineageView> {
  const byAudience = new Map<string, RuntimeNarrativeVersion[]>();
  for (const v of versions) byAudience.set(v.audience, [...(byAudience.get(v.audience) ?? []), v]);

  const out: Record<string, VersionLineageView> = {};
  for (const [audience, list] of byAudience) out[audience] = lineageOf(list);
  return out;
}

/* ---- 13 · provider attempt summary ----------------------------------------------------------------------- */
export interface ProviderAttemptSummaryView {
  attempts: number;
  succeeded: number;
  failed: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** True when ANY attempt reported estimated rather than measured usage. */
  usageEstimated: boolean;
  byProvider: Record<string, number>;
  meanLatencyMs: number | null;
}

export function providerAttemptSummaryView(attempts: readonly RuntimeProviderAttempt[]): ProviderAttemptSummaryView {
  const byProvider: Record<string, number> = {};
  for (const a of attempts) byProvider[a.providerId] = (byProvider[a.providerId] ?? 0) + 1;

  const latencies = attempts.map((a) => a.latencyMs).filter((l): l is number => l !== null);
  return {
    attempts: attempts.length,
    succeeded: attempts.filter((a) => a.status === "succeeded").length,
    failed: attempts.filter((a) => a.status !== "succeeded").length,
    totalCost: attempts.reduce((sum, a) => sum + (a.actualCost ?? a.estimatedCost ?? 0), 0),
    totalInputTokens: attempts.reduce((sum, a) => sum + (a.inputTokens ?? 0), 0),
    totalOutputTokens: attempts.reduce((sum, a) => sum + (a.outputTokens ?? 0), 0),
    usageEstimated: attempts.some((a) => a.usageEstimated),
    byProvider,
    meanLatencyMs: latencies.length === 0 ? null : Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
  };
}

/* ---- 14 · runtime event timeline ---------------------------------------------------------------------------- */
export interface EventTimelineEntry {
  sequence: number;
  eventType: string;
  stage: string | null;
  at: string;
  payload: Record<string, unknown>;
}

/**
 * Ordered by SEQUENCE, not by timestamp. Sequence is the authoritative order —
 * two events can share a millisecond, but never a sequence.
 */
export function eventTimelineView(events: readonly RuntimeEvent[]): EventTimelineEntry[] {
  return [...events]
    .sort((a, b) => a.sequence - b.sequence)
    .map((e) => ({
      sequence: e.sequence,
      eventType: e.eventType,
      stage: e.stage,
      at: e.occurredAt,
      payload: e.payload,
    }));
}

/* ---- 15 · run detail (composed) --------------------------------------------------------------------------------- */
export interface RunDetailView {
  run: RuntimeRun;
  timeline: RunTimelineEntry[];
  stageStatus: StageStatusRow[];
  artifacts: ArtifactSummaryRow[];
  evidence: EvidenceSummaryView;
  latestCheckpoint: RuntimeCheckpoint | null;
  reasoningJobs: number;
  events: EventTimelineEntry[];
}

export function runDetailView(input: {
  run: RuntimeRun;
  stages: readonly RuntimeStage[];
  artifacts: readonly RuntimeArtifact[];
  checkpoint: RuntimeCheckpoint | null;
  reasoningJobs: readonly RuntimeReasoningJob[];
  events: readonly RuntimeEvent[];
}): RunDetailView {
  return {
    run: input.run,
    timeline: runTimelineView(input.stages),
    stageStatus: stageStatusView(input.stages),
    artifacts: artifactSummaryView(input.artifacts),
    evidence: evidenceSummaryView(input.artifacts),
    latestCheckpoint: input.checkpoint,
    reasoningJobs: input.reasoningJobs.length,
    events: eventTimelineView(input.events),
  };
}

/* ---- shared ---------------------------------------------------------------------------------------------------- */
function lineageOf(versions: readonly { id: string; version: number; status: string; supersedesId: string | null }[]): VersionLineageView {
  const ordered = [...versions].sort((a, b) => a.version - b.version);
  const latest = ordered[ordered.length - 1] ?? null;
  return {
    versions: ordered.length,
    latestVersion: latest?.version ?? null,
    latestStatus: latest?.status ?? null,
    lineage: ordered.map((v) => v.id),
  };
}
