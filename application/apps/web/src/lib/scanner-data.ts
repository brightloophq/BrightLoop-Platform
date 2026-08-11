import "server-only";

import {
  advanceCommercialWorkflow,
  getScan,
  getScanArtifact,
  getScanAssessment,
  getScanClientNarrative,
  getScanCommercialProposal,
  getScanEvidenceValidation,
  getProspectPackageReview,
  getScanProposal,
  getScanReport,
  getScanTimeline,
  listScans,
  type ArtifactDTO,
  type PackageReviewDecision,
  type ScanDTO,
  type TimelineEntryDTO,
} from "@brightloop/application";
import { COMMERCIAL_STAGE_ORDER } from "@brightloop/domain";
import { loadCrawlerConfig } from "@brightloop/crawler";
import { loadAnthropicConfig } from "@brightloop/providers";
import { buildAppContext } from "./runtime-api";
import {
  buildCompetitorIntelligenceView,
  buildProposalIntelligenceView,
  buildNarrativeView,
  buildCommercialProposalView,
  buildClientNarrativeView,
  buildProspectPackageView,
  buildDiscoveryView,
  buildEvidenceView,
  buildEvidenceValidationView,
  buildStructuredView,
  buildProspectSummary,
  computeReasoningReadiness,
  emptyCompetitorIntelligenceView,
  emptyProposalIntelligenceView,
  emptyNarrativeView,
  nextStageView,
  readIdentity,
  PROPOSAL_SECTIONS,
  REPORT_SECTIONS,
  type CompetitorIntelligenceView,
  type ProposalIntelligenceView,
  type NarrativeView,
  type CommercialProposalView,
  type ClientNarrativeView,
  type ProspectPackageView,
  type DiscoveryView,
  type EvidenceView,
  type EvidenceValidationView,
  type NextStageView,
  type ProspectIdentity,
  type ProspectSummaryView,
  type ReasoningReadinessView,
  type RuntimeFlags,
  type StructuredView,
} from "./prospect-scanner";

/**
 * Prospect Scanner data loading (Phase C · Sprint C4).
 *
 * Server-only. Every read goes through a C1 application use-case — this module
 * never touches a repository or a runtime service, so the page inherits the same
 * authorization, tenancy and DTO boundary as the public API. `server-only` keeps
 * the crawler/provider config (and their SDK/DNS imports) out of the browser.
 */

/** Read the kill switches + the cost envelope for one reasoning turn. */
export function readRuntimeFlags(): RuntimeFlags {
  const crawler = loadCrawlerConfig();
  const provider = loadAnthropicConfig();

  // An UPPER BOUND for one turn, from configured caps × configured rates. This
  // is a safety disclosure, not billing: nothing is charged, metered, or stored.
  const estimatedMaxCostUsd = provider.enabled
    ? (provider.maxInputTokens / 1_000_000) * provider.cost.inputPerMTokens +
      (provider.maxOutputTokens / 1_000_000) * provider.cost.outputPerMTokens
    : null;

  return {
    crawlerEnabled: crawler.enabled,
    providerEnabled: provider.enabled,
    modelId: provider.enabled ? provider.model : null,
    maxOutputTokens: provider.enabled ? provider.maxOutputTokens : null,
    estimatedMaxCostUsd,
  };
}

/** Swallow a "not produced yet" read into `null` — a legitimate empty state. */
async function optional<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch {
    return null;
  }
}

export interface ScannerListData {
  scans: { scan: ScanDTO; identity: ProspectIdentity }[];
  flags: RuntimeFlags;
}

/** The scanner index: the operator's recent prospect scans. */
export async function loadScannerList(limit = 25): Promise<ScannerListData | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  const scans = await listScans(ctx, { limit });
  return {
    scans: scans.map((scan) => ({ scan, identity: readIdentity(scan.metadata) })),
    flags: readRuntimeFlags(),
  };
}

export interface ScanWorkspaceData {
  scan: ScanDTO;
  identity: ProspectIdentity;
  flags: RuntimeFlags;
  next: NextStageView;
  timeline: TimelineEntryDTO[];
  discovery: DiscoveryView;
  evidence: EvidenceView;
  /** Evidence-validation traceability surface (Sprint C-EV). */
  evidenceValidation: EvidenceValidationView;
  report: StructuredView;
  proposal: StructuredView;
  readiness: ReasoningReadinessView;
  summary: ProspectSummaryView;
  /** Read-only Competitor Intelligence status surface (C8). */
  competitor: CompetitorIntelligenceView;
  /** Read-only Proposal Intelligence status surface (C9). */
  proposalIntelligence: ProposalIntelligenceView;
  /** Read-only Narrative status surface (C10). */
  narrative: NarrativeView;
  /** Post-scan commercial proposal DRAFT surface (proposal_versions). */
  commercialProposal: CommercialProposalView;
  /** Post-scan client narrative surface (narrative_versions, audience=client). */
  clientNarrative: ClientNarrativeView;
  /** The prospect-package command-center view (readiness + review state). */
  prospectPackage: ProspectPackageView;
  /** The current human review decision on the package. */
  packageReviewDecision: PackageReviewDecision;
  /** True when the report shown is the machine-derived C6 assessment awaiting review. */
  reportReviewRequired: boolean;
  /** True when a discovery manifest exists, so an assessment can be run. */
  canAssess: boolean;
}

/**
 * Everything one scan workspace renders, read through use-cases in parallel.
 * Artifacts that do not exist yet resolve to their empty view rather than an
 * error, so the operator sees an explicit "not produced yet" state.
 */
export async function loadScanWorkspace(runId: string): Promise<ScanWorkspaceData | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;

  const scan = await getScan(ctx, runId);
  const flags = readRuntimeFlags();

  // DURABLE, SERVER-AUTHORITATIVE ADVANCE. The commercial workflow must not depend
  // on the completion request's fragile tail (serverless kill) or a client effect
  // firing after refresh. Whenever a COMPLETED scan is rendered — including the
  // post-completion refresh — we idempotently ENQUEUE and DRIVE it here,
  // synchronously, BEFORE reading the artifacts/timeline, so THIS render already
  // reflects the assembled package. The stages are pure/deterministic (no model
  // call), so the whole package assembles in a handful of fast turns. Idempotent:
  // a re-render is a cheap replay; completed jobs are never re-leased. A `failed`
  // kickoff is surfaced; the page never breaks on a commercial error.
  let commercialKickoffFailed = false;
  if (scan.lifecycle === "completed") {
    try {
      commercialKickoffFailed = (await advanceCommercialWorkflow(ctx, runId)).kickoff === "failed";
    } catch {
      commercialKickoffFailed = true; // never break the page on a commercial error — surface it instead
    }
  }

  const [timeline, manifestArtifact, ingressArtifact, competitorArtifact, proposalArtifact, narrativeArtifact, reportArtifact, proposalDocArtifact, assessment, evidenceValidationDto, commercialProposalDto, clientNarrativeDto, packageReviewDto] = await Promise.all([
    optional(getScanTimeline(ctx, runId)),
    optional(getScanArtifact(ctx, runId, "discovery_manifest")),
    optional(getScanArtifact(ctx, runId, "evidence_ingress")),
    optional(getScanArtifact(ctx, runId, "competitor_snapshot")),
    optional(getScanArtifact(ctx, runId, "proposal")),
    optional(getScanArtifact(ctx, runId, "narrative")),
    optional<ArtifactDTO>(getScanReport(ctx, runId)),
    optional<ArtifactDTO>(getScanProposal(ctx, runId)),
    optional(getScanAssessment(ctx, runId)),
    optional(getScanEvidenceValidation(ctx, runId)),
    optional<ArtifactDTO>(getScanCommercialProposal(ctx, runId)),
    optional<ArtifactDTO>(getScanClientNarrative(ctx, runId)),
    optional(getProspectPackageReview(ctx, runId)),
  ]);

  const identity = readIdentity(scan.metadata);
  const next = nextStageView(scan, flags);
  const discovery = buildDiscoveryView(manifestArtifact ?? null);
  const evidence = buildEvidenceView(ingressArtifact ?? null);
  const evidenceValidation = buildEvidenceValidationView(evidenceValidationDto ?? null, discovery);

  // Prefer an operator-approved (valid) C1 report; otherwise fall back to the
  // machine-derived C6 assessment, surfaced explicitly as "review required".
  const assessmentReport = assessment?.report ?? null;
  const reportSource: ArtifactDTO | null =
    reportArtifact ??
    (assessmentReport === null
      ? null
      : { id: assessmentReport.id, kind: assessmentReport.kind, version: assessmentReport.version, status: assessmentReport.validationStatus, createdAt: assessmentReport.createdAt, content: assessmentReport.content });
  const reportReviewRequired = reportArtifact === null && assessmentReport !== null;
  const report = buildStructuredView(reportSource, [...REPORT_SECTIONS]);
  const scanCompleted = scan.lifecycle === "completed";

  // Commercial workflow signals, read from the append-only event timeline (never
  // inferred from artifact presence). Computed BEFORE the competitor view so §11 can
  // honestly distinguish not-run / failed / insufficient-evidence.
  const events = timeline ?? [];
  const commercialStageSet = new Set<string>(COMMERCIAL_STAGE_ORDER);
  const commercialEnqueued = events.some((e) => e.type === "runtime.commercial.enqueued");
  const commercialFailed =
    commercialKickoffFailed ||
    events.some(
      (e) =>
        e.type === "runtime.commercial.enqueue_failed" ||
        (e.type === "runtime.queue.dead_lettered" && e.stage !== null && commercialStageSet.has(e.stage)),
    );
  const competitorStageRan = events.some((e) => e.type === "runtime.commercial.competitor_discovered");

  const competitor = competitorArtifact
    ? buildCompetitorIntelligenceView(competitorArtifact.content, { scanCompleted, competitorStageRan, commercialFailed })
    : emptyCompetitorIntelligenceView();
  const narrative = narrativeArtifact ? buildNarrativeView(narrativeArtifact.content) : emptyNarrativeView();
  const proposal = buildStructuredView(proposalDocArtifact, [...PROPOSAL_SECTIONS]);
  const proposalIntelligence = proposalArtifact ? buildProposalIntelligenceView(proposalArtifact.content) : emptyProposalIntelligenceView();

  // Post-scan commercial package: the DRAFT proposal + client narrative + the
  // deterministic readiness/review fold.
  const commercialProposal = buildCommercialProposalView(commercialProposalDto ?? null);
  const clientNarrative = buildClientNarrativeView(clientNarrativeDto ?? null);
  const packageReviewDecision: PackageReviewDecision = packageReviewDto?.decision ?? "pending";
  const prospectPackage = buildProspectPackageView({
    scanCompleted,
    reportPresent: reportArtifact !== null,
    competitor,
    proposal: commercialProposal,
    narrative: clientNarrative,
    commercialEnqueued,
    commercialFailed,
    reviewDecision: packageReviewDecision,
  });

  const readiness = computeReasoningReadiness({
    scan,
    flags,
    discovery,
    evidence,
    next,
    now: new Date().toISOString(),
  });

  return {
    scan,
    identity,
    flags,
    next,
    timeline: timeline ?? [],
    discovery,
    evidence,
    evidenceValidation,
    report,
    proposal,
    readiness,
    summary: buildProspectSummary({ scan, identity, discovery, evidence, report, commercialProposal, prospectPackage, readiness, next }),
    competitor,
    proposalIntelligence,
    narrative,
    commercialProposal,
    clientNarrative,
    prospectPackage,
    packageReviewDecision,
    reportReviewRequired,
    canAssess: manifestArtifact !== null,
  };
}

/** Organizations the operator can attach a prospect scan to. */
export async function listScanOrganizations(): Promise<{ id: string; name: string }[]> {
  const { createClient } = await import("./supabase/server");
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("id, company").order("company", { ascending: true }).limit(200);
  return (data ?? []).map((r) => ({ id: r.id, name: r.company }));
}
