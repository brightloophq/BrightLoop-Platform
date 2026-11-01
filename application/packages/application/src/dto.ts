/* =============================================================================
 * Application DTOs (Phase C · Sprint C1).
 *
 * The browser NEVER receives a domain entity, a repository row, or a runtime
 * internal. These are the only shapes that cross the boundary outward, and the
 * mappers below are the only place a `RuntimeRun` / read-model becomes one.
 *
 * A response carries status, progress, stage, timestamps, ids, metadata and a
 * summary — nothing else. No evidence, no artifacts, no DB columns, no lease
 * fields, no idempotency keys, no checksums.
 * ========================================================================== */

import type {
  EvidenceSupportLevel,
  RuntimeArtifact,
  RuntimeNarrativeVersion,
  RuntimeProposalVersion,
  RuntimeRun,
} from "@brightloop/schema";
import { PIPELINE_STAGE_ORDER } from "@brightloop/domain";
import type { runtimeReadModels } from "@brightloop/domain";

/* ---- requests --------------------------------------------------------------- */
interface CreateScanOptions {
  /** Free-form budget/policy envelope. Not persisted domain data. */
  metadata?: Record<string, unknown>;
  /** ISO-8601. Absolute time after which the run must stop. */
  deadline?: string | null;
}

/** Exactly one explicit scan subject; existing client-owned callers remain valid. */
export type CreateScanRequest = CreateScanOptions & (
  | { clientId: string; leadId?: never }
  | { clientId?: never; leadId: string }
);

/* ---- scan status ------------------------------------------------------------ */
export type ScanLifecycle = "pending" | "running" | "completed" | "failed" | "cancelled" | "blocked";

export interface ScanDTO {
  id: string;
  clientId: string | null;
  leadId: string | null;
  scanId: string;
  /** Product-facing lifecycle — a coarsening of the 14 runtime statuses. */
  lifecycle: ScanLifecycle;
  /** The raw runtime status, for clients that want the fine-grained value. */
  status: string;
  currentStage: string | null;
  failedStage: string | null;
  /** 0–100, derived from stage position; 100 only when completed. */
  progress: number;
  createdAt: string;
  updatedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** Wall-clock ms from start to finish (or to now-less end), or null if unstarted. */
  durationMs: number | null;
  metadata: Record<string, unknown>;
  /** One-line human summary of where the scan is. */
  summary: string;
}

/* ---- timeline / report / proposal / narrative ------------------------------- */
export interface TimelineEntryDTO {
  sequence: number;
  type: string;
  stage: string | null;
  at: string;
  detail: Record<string, unknown>;
}

export interface ArtifactDTO {
  id: string;
  kind: string;
  version: number;
  status: string;
  createdAt: string;
  /** The structured envelope (already free of hidden reasoning by construction). */
  content: Record<string, unknown>;
}

export interface NarrativeDTO extends ArtifactDTO {
  audience: string;
}

/* ---- evidence validation (Sprint C-EV) --------------------------------------
 * The traceability surface: every conclusion, its support level, its recalculated
 * confidence, and the evidence ids behind it. A dedicated projecting DTO — NOT a
 * raw `validated_claims` envelope passthrough — is what keeps model-shaped content
 * off the wire while still making each conclusion auditable. */

/** One provider claim measured against evidence. */
export interface EvidenceClaimTraceDTO {
  id: string;
  /** Bounded, sanitized statement (never raw model output); empty when withheld. */
  statement: string;
  supportLevel: EvidenceSupportLevel;
  /** Recalculated 0–100 confidence, derived from evidence quality. */
  confidence: number;
  /** True when the claim carries forward into findings. */
  survives: boolean;
  evidenceIds: string[];
  /** Stable codes explaining the level + confidence (the "why"). */
  reasonCodes: string[];
}

/** A resolvable evidence reference — the id a conclusion cites, and its origin. */
export interface EvidenceRefDTO {
  id: string;
  /** The source origin (page URL), bounded; empty when unknown. */
  url: string;
  /** The evidence source family (e.g. "website" | "pages"). */
  source: string;
  /** observed | estimated | inferred | unavailable. */
  state: string;
}

/** One deterministic finding (strength/weakness), always evidence-linked. */
export interface EvidenceFindingTraceDTO {
  id: string;
  title: string;
  /** "strength" | "weakness". */
  kind: string;
  category: string | null;
  /** 0–100 confidence the deterministic engine assigned. */
  confidence: number;
  evidenceIds: string[];
}

export interface EvidenceValidationDTO {
  /** True once either deterministic findings or validated claims exist. */
  present: boolean;
  /** True when a live provider produced claims for validation. */
  providerAttempted: boolean;
  enrichmentStatus: string;
  supported: number;
  partiallySupported: number;
  weakSupport: number;
  unsupported: number;
  contradicted: number;
  /** supported + partially + weak — the claims that carry forward. */
  surviving: number;
  groundedCount: number;
  rejectedCount: number;
  /** Mean recalculated confidence across surviving claims (0 when none). */
  averageConfidence: number;
  /** Every cited evidence reference (id → origin), for the drill-down join. */
  evidence: EvidenceRefDTO[];
  /** Deterministic strengths/weaknesses — always available once findings run. */
  findings: EvidenceFindingTraceDTO[];
  /** Grounded provider claims that survived (present only with live AI). */
  claims: EvidenceClaimTraceDTO[];
  /** Provider claims validation rejected, with their negative support level. */
  rejectedClaims: EvidenceClaimTraceDTO[];
}

/* ---- mappers ---------------------------------------------------------------- */
/** Coarsen the 14 runtime statuses into the 6 the product surfaces. */
export function toLifecycle(status: string): ScanLifecycle {
  if (status === "completed" || status === "failed" || status === "cancelled" || status === "blocked") return status;
  if (status === "pending") return "pending";
  return "running";
}

/**
 * Progress as a percentage of the 13-stage pipeline. Completed is always 100;
 * a terminal-but-incomplete run (failed/cancelled) reports how far it got.
 */
export function progressFor(run: RuntimeRun): number {
  if (run.status === "completed") return 100;
  const total = PIPELINE_STAGE_ORDER.length;
  const stage = run.failedStage ?? run.currentStage;
  if (stage === null) return 0;
  const index = (PIPELINE_STAGE_ORDER as readonly string[]).indexOf(stage);
  if (index < 0) return 0;
  // a stage in flight counts as its own slot begun, not finished
  return Math.round((index / total) * 100);
}

/**
 * Elapsed processing time. Anchored on `startedAt` when the runtime has stamped
 * it, else on `createdAt` — the runtime's normal advance path does not set
 * `startedAt`, so `createdAt` is the honest floor rather than reporting null for
 * every in-flight scan. The end is the terminal stamp, else the last update.
 */
function durationMs(run: RuntimeRun): number | null {
  const start = run.startedAt ?? run.createdAt;
  const end = run.completedAt ?? run.failedAt ?? run.cancelledAt ?? run.updatedAt ?? start;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

function summarize(run: RuntimeRun): string {
  switch (toLifecycle(run.status)) {
    case "pending": return "Scan queued and waiting to start.";
    case "running": return `Scan in progress${run.currentStage ? ` at ${run.currentStage}` : ""}.`;
    case "completed": return "Scan completed.";
    case "failed": return `Scan failed${run.failedStage ? ` at ${run.failedStage}` : ""}.`;
    case "cancelled": return "Scan cancelled.";
    case "blocked": return "Scan blocked, awaiting dependencies.";
  }
}

/** The ONLY place a `RuntimeRun` becomes a wire shape. */
export function toScanDTO(run: RuntimeRun): ScanDTO {
  return {
    id: run.id,
    clientId: run.clientId,
    leadId: run.leadId,
    scanId: run.scanId,
    lifecycle: toLifecycle(run.status),
    status: run.status,
    currentStage: run.currentStage,
    failedStage: run.failedStage,
    progress: progressFor(run),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationMs: durationMs(run),
    metadata: run.metadata,
    summary: summarize(run),
  };
}

/** Map an already-transformed runtime event-timeline entry to the UI shape. */
export function toTimelineDTO(entry: runtimeReadModels.EventTimelineEntry): TimelineEntryDTO {
  return { sequence: entry.sequence, type: entry.eventType, stage: entry.stage, at: entry.at, detail: entry.payload };
}

export function toArtifactDTO(artifact: RuntimeArtifact): ArtifactDTO {
  return {
    id: artifact.id,
    kind: artifact.kind,
    version: artifact.version,
    status: artifact.validationStatus,
    createdAt: artifact.createdAt,
    content: artifact.envelope,
  };
}

export function toProposalDTO(version: RuntimeProposalVersion): ArtifactDTO {
  return {
    id: version.id,
    kind: "proposal",
    version: version.version,
    status: version.status,
    createdAt: version.createdAt,
    content: version.envelope,
  };
}

export function toNarrativeDTO(version: RuntimeNarrativeVersion): NarrativeDTO {
  return {
    id: version.id,
    kind: "narrative",
    audience: version.audience,
    version: version.version,
    status: version.status,
    createdAt: version.createdAt,
    content: version.envelope,
  };
}
