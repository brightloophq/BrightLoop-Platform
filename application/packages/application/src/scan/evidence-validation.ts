/* =============================================================================
 * Use-case: a scan's evidence validation (Sprint C-EV).
 *
 * The traceability read behind the "every conclusion traces to evidence" surface.
 * It reads the deterministic `findings` and the `validated_claims` artifacts and
 * projects them into a bounded, explicit-pick `EvidenceValidationDTO`.
 *
 * ██ WHY A DEDICATED USE-CASE (and not `getScanArtifact`) ██
 *   `validated_claims` is deliberately NOT in the raw readable-artifact allowlist
 *   because its envelope could carry model-shaped text. This use-case is the
 *   sanctioned gate: it never returns the raw envelope. Every string is picked by
 *   name and passed through `safeText` (tag/control-stripped + length-capped), and
 *   REJECTED (ungrounded) claim statements are never surfaced at all — only their
 *   support level, evidence ids and reason codes. That is what makes "no raw
 *   provider output reaches the operator" a property of this module.
 * ========================================================================== */

import type { EvidenceSupportLevel, RuntimeArtifact } from "@brightloop/schema";
import type { AppContext } from "../context.js";
import { SCAN_READ_CAP } from "../context.js";
import type { EvidenceClaimTraceDTO, EvidenceFindingTraceDTO, EvidenceRefDTO, EvidenceValidationDTO } from "../dto.js";
import { unwrap } from "../runtime-result.js";
import { loadAuthorizedRun } from "./shared.js";

const SUPPORT_LEVELS: ReadonlySet<string> = new Set(["supported", "partially_supported", "weak_support", "unsupported", "contradicted"]);

/* tag/control stripping — the same defence-in-depth the operator view models use. */
const TAGGISH = /<[^>]*>?/g;
// eslint-disable-next-line no-control-regex
const CONTROLS = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]", "g");

/** Coerce any value to bounded, tag-free, control-free plain text. */
function safeText(value: unknown, max = 200): string {
  if (typeof value !== "string") return "";
  const clean = value.replace(TAGGISH, " ").replace(CONTROLS, "").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function strings(value: unknown, max = 80): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string").map((s) => safeText(s, 80)).filter((s) => s !== "").slice(0, max) : [];
}

function supportLevel(value: unknown): EvidenceSupportLevel {
  return typeof value === "string" && SUPPORT_LEVELS.has(value) ? (value as EvidenceSupportLevel) : "unsupported";
}

/** Project one grounded/rejected claim record, WITHOUT its raw statement when withheld. */
function toClaim(raw: unknown, includeStatement: boolean): EvidenceClaimTraceDTO {
  const r = (raw !== null && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    id: safeText(r["id"], 120) || "claim",
    statement: includeStatement ? safeText(r["claim"], 240) : "",
    supportLevel: supportLevel(r["supportLevel"]),
    confidence: Math.max(0, Math.min(100, num(r["recomputedConfidence"]))),
    survives: r["survives"] === true,
    evidenceIds: strings(r["evidenceIds"]),
    reasonCodes: strings(r["reasonCodes"]),
  };
}

/** Project the deterministic findings (strengths + weaknesses), always evidence-linked. */
function toFindings(findings: RuntimeArtifact | null): EvidenceFindingTraceDTO[] {
  if (findings === null) return [];
  const env = findings.envelope;
  const project = (kind: string) => (raw: unknown): EvidenceFindingTraceDTO => {
    const r = (raw !== null && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      id: safeText(r["id"], 120) || kind,
      title: safeText(r["title"], 200),
      kind,
      category: safeText(r["category"], 80) || null,
      confidence: Math.max(0, Math.min(100, num(r["confidence"]))),
      evidenceIds: strings(r["evidenceIds"]),
    };
  };
  const strengths = Array.isArray(env["strengths"]) ? (env["strengths"] as unknown[]).map(project("strength")) : [];
  const weaknesses = Array.isArray(env["weaknesses"]) ? (env["weaknesses"] as unknown[]).map(project("weakness")) : [];
  return [...strengths, ...weaknesses];
}

/** Project the evidence bundle into a bounded id→origin index for the drill-down. */
function toEvidenceRefs(bundle: RuntimeArtifact | null): EvidenceRefDTO[] {
  if (bundle === null) return [];
  const items = Array.isArray(bundle.envelope["items"]) ? (bundle.envelope["items"] as unknown[]) : [];
  return items.map((raw) => {
    const r = (raw !== null && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const provenance = (r["provenance"] ?? {}) as Record<string, unknown>;
    const citations = Array.isArray(r["citations"]) ? (r["citations"] as unknown[]) : [];
    const url = safeText(provenance["origin"], 300) || safeText(citations[0], 300);
    return {
      id: safeText(r["id"], 120),
      url,
      source: safeText(r["source"], 40) || "pages",
      state: safeText(r["state"], 20) || "unavailable",
    };
  }).filter((r) => r.id !== "");
}

/** The projecting mapper — the ONLY place validated_claims/findings become wire. */
export function toEvidenceValidationDTO(claims: RuntimeArtifact | null, findings: RuntimeArtifact | null, bundle: RuntimeArtifact | null = null): EvidenceValidationDTO {
  const findingTraces = toFindings(findings);
  const env = claims?.envelope ?? null;
  const support = (env?.["support"] ?? {}) as Record<string, unknown>;
  const grounded = env !== null && Array.isArray(env["claims"]) ? (env["claims"] as unknown[]).map((c) => toClaim(c, true)) : [];
  // Rejected claim statements are NEVER surfaced — only level, evidence, reasons.
  const rejected = env !== null && Array.isArray(env["rejected"]) ? (env["rejected"] as unknown[]).map((c) => toClaim(c, false)) : [];

  return {
    present: claims !== null || findings !== null,
    evidence: toEvidenceRefs(bundle),
    providerAttempted: env?.["providerAttempted"] === true,
    enrichmentStatus: safeText(env?.["enrichmentStatus"], 40) || "unavailable",
    supported: num(support["supported"]),
    partiallySupported: num(support["partiallySupported"]),
    weakSupport: num(support["weakSupport"]),
    unsupported: num(support["unsupported"]),
    contradicted: num(support["contradicted"]),
    surviving: num(support["surviving"]),
    groundedCount: num(env?.["groundedCount"]),
    rejectedCount: num(env?.["rejectedCount"]),
    averageConfidence: Math.max(0, Math.min(100, num(support["averageConfidence"]))),
    findings: findingTraces,
    claims: grounded,
    rejectedClaims: rejected,
  };
}

/**
 * The evidence-validation surface for a scan: deterministic findings + the
 * validated provider claims, each with a support level, a recalculated
 * confidence, and its evidence ids. Absent artifacts yield an explicit
 * `present:false` DTO (a legitimate empty state), never an error.
 */
export async function getScanEvidenceValidation(ctx: AppContext, rawRunId: unknown): Promise<EvidenceValidationDTO> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_READ_CAP);
  const claims = unwrap(await ctx.services.artifacts.latest(run.id, "validated_claims"));
  const findings = unwrap(await ctx.services.artifacts.latest(run.id, "findings"));
  const bundle = unwrap(await ctx.services.artifacts.latest(run.id, "evidence_bundle"));
  return toEvidenceValidationDTO(claims, findings, bundle);
}
