/* =============================================================================
 * Commercial Proposal assembler (PURE, deterministic, offline).
 *
 * Composes a client-ready proposal DRAFT by re-keying already-verified pipeline
 * intelligence — the C9 proposal-intelligence snapshot (the verified "recommended
 * work"), the internal report projection (situation / issues / opportunities), and
 * the C8 competitor snapshot (competitor context). It runs no model, invents no
 * recommendation, and asserts no price:
 *   • recommended work is copied verbatim from the C9 snapshot items (each keeps
 *     its evidence ids); if the snapshot is unavailable the proposal is
 *     `insufficient_evidence`, never fabricated.
 *   • pricing is ALWAYS `needs_pricing` here — no authoritative pricing config
 *     exists, and AI never invents a price. The draft is still `draft_ready`.
 * Output is content-addressed (FNV-1a over the stable projection) so a replay
 * hashes identically regardless of id / timestamp.
 * ========================================================================== */

import {
  commercialProposalSchema,
  COMMERCIAL_PROPOSAL_FORMULA_VERSION,
  type CommercialProposal,
  type CommercialPricingState,
} from "@brightloop/schema";
import { artifactChecksum } from "../pipeline-run/artifacts.js";

export interface AssembleCommercialProposalInput {
  scanId: string;
  clientId: string | null;
  /** The persisted C9 `proposal` snapshot envelope (proposalIntelligenceSnapshot). */
  proposalSnapshot: Record<string, unknown>;
  /** The persisted `internal_intelligence_report` envelope. */
  reportEnvelope: Record<string, unknown>;
  /** The persisted C8 `competitor_snapshot` envelope, or null. */
  competitorSnapshot: Record<string, unknown> | null;
  /** Artifact ids this proposal is composed from (lineage). */
  sourceArtifacts: string[];
  now: string;
  id: string;
}

export interface AssembleCommercialProposalResult {
  proposal: CommercialProposal;
}

/* ---- defensive readers (envelopes are untyped Record<string,unknown>) -------- */
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const rec = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strArr = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string");
const clip = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

const BANDS = new Set(["very_low", "low", "moderate", "high", "very_high"]);
function confidenceFrom(v: unknown): { value: number; band: "very_low" | "low" | "moderate" | "high" | "very_high" } {
  const c = rec(v);
  const band = str(c["band"]);
  return { value: Math.max(0, Math.min(100, num(c["value"]))), band: (BANDS.has(band) ? band : "low") as "low" };
}

/** Assemble the proposal draft. Pure — same inputs produce an identical checksum. */
export function assembleCommercialProposal(input: AssembleCommercialProposalInput): AssembleCommercialProposalResult {
  const snap = input.proposalSnapshot;
  const report = input.reportEnvelope;
  const snapAvailable = str(snap["status"]) === "available";

  // Recommended work — copied verbatim from the verified C9 items (each keeps its
  // evidence). Items without evidence are dropped (never unsupported).
  const items = arr(snap["proposals"]).map(rec);
  const recommendedWork = items
    .map((it) => ({
      sourceId: str(it["id"]),
      title: clip(str(it["title"]), 160),
      solution: clip(str(it["recommendedSolution"]), 400),
      priority: clip(str(it["priority"]) || "unknown", 24),
      effort: clip(str(it["estimatedEffort"]) || "unknown", 24),
      evidenceIds: strArr(it["supportingEvidenceIds"]).slice(0, 24),
    }))
    .filter((w) => w.sourceId !== "" && w.evidenceIds.length > 0)
    .slice(0, 8);

  const insufficient = !snapAvailable || recommendedWork.length === 0;

  // Situation / issues / opportunities — projected from the verified report.
  const executiveSummary = clip(str(report["executiveOverview"]), 1000);
  const profile = rec(report["businessProfile"]);
  const observedSituation = clip(
    [str(report["indexSummary"]), str(profile["identity"]) && `Identity: ${str(profile["identity"])}.`, str(report["readinessSummary"])]
      .filter((s) => s !== "")
      .join(" "),
    1000,
  );

  const keyIssues = arr(report["risks"])
    .map(rec)
    .map((r) => ({ title: clip(str(r["title"]), 160), detail: clip(str(r["description"]), 400), evidenceIds: strArr(r["evidenceIds"]).slice(0, 24) }))
    .filter((k) => k.title !== "")
    .slice(0, 6);

  const opportunities = arr(report["opportunities"])
    .map(rec)
    .map((o) => ({ title: clip(str(o["title"]), 160), detail: clip(str(o["businessImpact"]), 400), evidenceIds: strArr(o["evidenceIds"]).slice(0, 24) }))
    .filter((o) => o.title !== "")
    .slice(0, 6);

  // Competitor context — from the C8 snapshot, only when it verified something.
  const comp = input.competitorSnapshot === null ? null : rec(input.competitorSnapshot);
  const competitorContext =
    comp !== null && str(comp["status"]) === "available"
      ? {
          status: clip(str(comp["status"]), 40),
          competitorCount: arr(comp["competitors"]).length,
          marketPosition: str(comp["marketPosition"]) ? clip(str(comp["marketPosition"]), 40) : null,
          summary: clip(str(comp["summary"]), 400),
        }
      : null;

  const supportingEvidenceIds = [
    ...new Set([...recommendedWork.flatMap((w) => w.evidenceIds), ...keyIssues.flatMap((k) => k.evidenceIds), ...opportunities.flatMap((o) => o.evidenceIds)]),
  ].slice(0, 200);

  // Pricing is NEVER invented — no authoritative pricing configuration exists.
  const commercialState: CommercialPricingState = "needs_pricing";

  const proposedNextStep = clip(
    "Review this draft with the Auxion team, confirm scope, and set commercial terms (pricing and timeline) before it is shared with the prospect. No terms are proposed automatically.",
    400,
  );

  const confidence = confidenceFrom(snap["confidence"]);
  const sourceArtifacts = [...new Set(input.sourceArtifacts)].slice(0, 32);

  const core = {
    scanId: input.scanId,
    clientId: input.clientId,
    status: insufficient ? ("insufficient_evidence" as const) : ("draft_ready" as const),
    reason: insufficient ? (snapAvailable ? "no_recommended_work" : "proposal_intelligence_unavailable") : null,
    commercialState,
    pricing: null,
    executiveSummary,
    observedSituation,
    keyIssues,
    opportunities,
    recommendedWork,
    competitorContext,
    proposedNextStep,
    supportingEvidenceIds,
    confidence,
    reviewRequired: true,
    formulaVersion: COMMERCIAL_PROPOSAL_FORMULA_VERSION,
  };

  const checksum = artifactChecksum(core as unknown as Record<string, unknown>);
  const proposal = commercialProposalSchema.parse({
    ...core,
    id: input.id,
    sourceArtifacts,
    checksum,
    generatedAt: input.now,
  });

  return { proposal };
}
