/* =============================================================================
 * Client Narrative assembler (PURE, deterministic, offline) — PRESENTATION ONLY.
 *
 * Transforms already-verified intelligence into a concise, client-facing story
 * answering the six questions a prospect asks: what did we observe, what is
 * holding the business back, what opportunities exist, what do we recommend, why,
 * and what happens next. It runs NO model and creates NO new factual claim: every
 * paragraph is a fixed template filled with values COPIED from the report /
 * proposal / competitor artifacts, and every section carries the `supportingArtifacts`
 * it was composed from. When a source is unavailable the section says so plainly
 * rather than inventing. Output is content-addressed for idempotent replay.
 * ========================================================================== */

import {
  clientNarrativeSchema,
  CLIENT_NARRATIVE_FORMULA_VERSION,
  type ClientNarrative,
} from "@brightloop/schema";
import { artifactChecksum } from "../pipeline-run/artifacts.js";

export interface AssembleClientNarrativeInput {
  scanId: string;
  clientId: string | null;
  /** The persisted `internal_intelligence_report` envelope. */
  reportEnvelope: Record<string, unknown>;
  /** The persisted commercial proposal envelope (CommercialProposal), or null. */
  proposal: Record<string, unknown> | null;
  /** The persisted C8 `competitor_snapshot` envelope, or null. */
  competitorSnapshot: Record<string, unknown> | null;
  reportArtifactId: string | null;
  proposalArtifactId: string | null;
  competitorArtifactId: string | null;
  sourceArtifacts: string[];
  now: string;
  id: string;
}

export interface AssembleClientNarrativeResult {
  narrative: ClientNarrative;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const rec = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const clip = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const titles = (items: unknown[], n: number): string[] => items.map(rec).map((r) => str(r["title"])).filter((t) => t !== "").slice(0, n);
const list = (xs: string[]): string => (xs.length === 0 ? "" : xs.length === 1 ? xs[0]! : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

const BANDS = new Set(["very_low", "low", "moderate", "high", "very_high"]);
function confidenceFrom(v: unknown): { value: number; band: "very_low" | "low" | "moderate" | "high" | "very_high" } {
  const c = rec(v);
  const band = str(c["band"]);
  return { value: Math.max(0, Math.min(100, num(c["value"]))), band: (BANDS.has(band) ? band : "low") as "low" };
}

/** Assemble the client narrative. Pure — same inputs produce an identical checksum. */
export function assembleClientNarrative(input: AssembleClientNarrativeInput): AssembleClientNarrativeResult {
  const report = input.reportEnvelope;
  const proposal = input.proposal === null ? null : rec(input.proposal);
  const comp = input.competitorSnapshot === null ? null : rec(input.competitorSnapshot);

  const reportRefs = input.reportArtifactId ? [input.reportArtifactId] : [];
  const proposalRefs = input.proposalArtifactId ? [input.proposalArtifactId] : [];
  const competitorRefs = input.competitorArtifactId ? [input.competitorArtifactId] : [];

  const overview = str(report["executiveOverview"]);
  const indexSummary = str(report["indexSummary"]);
  const riskTitles = titles(arr(report["risks"]), 4);
  const oppTitles = titles(arr(report["opportunities"]), 4);
  const workTitles = proposal === null ? [] : titles(arr(proposal["recommendedWork"]), 3);
  const competitorAvailable = comp !== null && str(comp["status"]) === "available";

  /* ---- section templates (fixed; values copied, never invented) ------------- */
  const observedParas = [overview || "We reviewed the information available on the public website.", indexSummary].filter((s) => s !== "").map((s) => clip(s, 600));
  if (competitorAvailable) {
    observedParas.push(clip(`We also identified ${arr(comp!["competitors"]).length} verifiable competitor reference(s) for market context.`, 600));
  }

  const challengesParas =
    riskTitles.length > 0
      ? [clip(`The evidence points to a small number of areas holding the business back: ${list(riskTitles)}.`, 600)]
      : ["No material blockers were evidenced from the available information."];

  const opportunitiesParas =
    oppTitles.length > 0
      ? [clip(`There are clear opportunities to build on: ${list(oppTitles)}.`, 600)]
      : ["No specific opportunities could be evidenced from the available information yet."];

  const recommendationParas =
    workTitles.length > 0
      ? [clip(`Auxion recommends focusing on: ${list(workTitles)}.`, 600)]
      : ["No recommended work could be evidenced yet — a fuller review is needed before recommending a direction."];

  const conf = confidenceFrom(report["confidence"]);
  const rationaleParas = [
    clip(
      `These recommendations follow directly from what the evidence shows${riskTitles.length > 0 ? ` about ${list(riskTitles.slice(0, 2))}` : ""}. They are presented with ${conf.band.replace("_", " ")} confidence and should be confirmed with Auxion before any commitment.`,
      600,
    ),
  ];

  const nextStepParas = [
    "The next step is a short conversation with the Auxion team to confirm scope and agree commercial terms. Nothing is finalised or shared automatically.",
  ];

  const sections = [
    { key: "observed" as const, heading: "What we observed", paragraphs: observedParas.slice(0, 4), supportingArtifacts: reportRefs },
    { key: "challenges" as const, heading: "What appears to be holding you back", paragraphs: challengesParas.slice(0, 4), supportingArtifacts: reportRefs },
    { key: "opportunities" as const, heading: "Where the opportunities are", paragraphs: opportunitiesParas.slice(0, 4), supportingArtifacts: reportRefs },
    { key: "recommendation" as const, heading: "What we recommend", paragraphs: recommendationParas.slice(0, 4), supportingArtifacts: [...proposalRefs, ...competitorRefs] },
    { key: "rationale" as const, heading: "Why", paragraphs: rationaleParas.slice(0, 4), supportingArtifacts: [...reportRefs, ...proposalRefs] },
    { key: "next_step" as const, heading: "What happens next", paragraphs: nextStepParas, supportingArtifacts: [] },
  ];

  // "Ready" once the core report exists; the narrative always has the report to
  // present. Insufficient only when there is genuinely nothing to say.
  const hasContent = overview !== "" || riskTitles.length > 0 || oppTitles.length > 0;
  const status = hasContent ? ("ready" as const) : ("insufficient_evidence" as const);
  const sourceArtifacts = [...new Set(input.sourceArtifacts)].slice(0, 32);

  const core = {
    scanId: input.scanId,
    clientId: input.clientId,
    audience: "client" as const,
    status,
    reason: hasContent ? null : "insufficient_intelligence",
    sections,
    confidence: conf,
    reviewRequired: true,
    formulaVersion: CLIENT_NARRATIVE_FORMULA_VERSION,
  };

  const checksum = artifactChecksum(core as unknown as Record<string, unknown>);
  const narrative = clientNarrativeSchema.parse({ ...core, id: input.id, sourceArtifacts, checksum, generatedAt: input.now });
  return { narrative };
}
