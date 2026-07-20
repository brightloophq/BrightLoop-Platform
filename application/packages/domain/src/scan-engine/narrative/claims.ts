/* =============================================================================
 * Narrative claims & claim safety (Sprint 12 §3/§7) — PURE.
 *
 * A claim is a TEMPLATED statement bound to structured values — never free prose.
 * `validateClaim` is the integrity gate every claim must pass before it can enter
 * a section, returning structured rejection reasons.
 *
 * HARD RULES:
 *   · factual claims require OBSERVED evidence;
 *   · estimated claims must declare their basis;
 *   · inferred claims stay labelled;
 *   · causal claims require explicit supporting relationships;
 *   · unavailable data is never rewritten as certainty;
 *   · language may never exceed the source confidence;
 *   · competitor / financial / ROI / market-leader claims need their gates.
 * ========================================================================== */

import {
  narrativeClaimSchema,
  type ClaimRejectionReason,
  type NarrativeAudience,
  type NarrativeClaim,
  type NarrativeClaimRejection,
  type NarrativeClaimType,
  type StatementData,
} from "@brightloop/schema";
import { bandFor, isPermittedPhrase, sensitivityPermitted, tonePolicy } from "./policy.js";

/** Render a template with `{key}` placeholders. Deterministic; no AI. */
export function renderTemplate(template: string, values: Record<string, string | number | boolean | null>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = values[key];
    return v === undefined || v === null ? "unavailable" : String(v);
  });
}

/** Build a structured statement from a template id + values. Pure. */
export function statement(template: string, values: Record<string, string | number | boolean | null> = {}): StatementData {
  return { template, values, text: renderTemplate(template, values).slice(0, 2000) };
}

export interface NewClaimInput {
  id: string;
  type: NarrativeClaimType;
  statement: StatementData;
  evidenceIds?: string[];
  evidenceState: NarrativeClaim["evidenceState"];
  confidence: number;
  freshnessBand?: NarrativeClaim["freshnessBand"];
  contradictionStatus?: NarrativeClaim["contradictionStatus"];
  estimationBasis?: string | null;
  causalSupport?: string[];
  limitations?: string[];
  citationIds?: string[];
  audienceVisibility?: NarrativeAudience[];
  sensitivity?: NarrativeClaim["sensitivity"];
  provenance?: NarrativeClaim["provenance"];
}

/** Build a claim. Validation is separate — see `validateClaim`. Pure. */
export function buildClaim(input: NewClaimInput): NarrativeClaim {
  return narrativeClaimSchema.parse({
    id: input.id,
    type: input.type,
    statement: input.statement,
    evidenceIds: input.evidenceIds ?? [],
    evidenceState: input.evidenceState,
    confidence: Math.max(0, Math.min(100, Math.round(input.confidence))),
    confidenceBand: bandFor(input.confidence),
    freshnessBand: input.freshnessBand ?? null,
    contradictionStatus: input.contradictionStatus ?? "none",
    estimationBasis: input.estimationBasis ?? null,
    causalSupport: input.causalSupport ?? [],
    limitations: input.limitations ?? [],
    citationIds: input.citationIds ?? [],
    audienceVisibility: input.audienceVisibility ?? [],
    sensitivity: input.sensitivity ?? "internal",
    reviewRequired: input.contradictionStatus === "contradicted" || input.confidence < 45,
    provenance: input.provenance ?? null,
  });
}

export interface ClaimSafetyContext {
  audience: NarrativeAudience;
  toneProfile?: Parameters<typeof tonePolicy>[0];
  /** Competitor ids that passed Sprint-10 validation. */
  validatedCompetitorIds?: readonly string[];
  /** Metric keys backed by a real benchmark/evidence record. */
  knownMetricKeys?: readonly string[];
  /** True only when real financial inputs were supplied (Sprint 11 rule). */
  financialInputsAvailable?: boolean;
  /** True only when validated cost AND benefit data exist. */
  costBenefitAvailable?: boolean;
  /** Sprint-10 competitor-set gate — required for any market-standing claim. */
  competitorSetSupportsMarketClaims?: boolean;
  /** Terminology that must not appear for this audience. */
  prohibitedTerminology?: readonly string[];
  /** Internal-only jargon, rejected in public/prospect output. */
  internalTerminology?: readonly string[];
  /** Freshness bands treated as stale. */
  staleBands?: readonly string[];
}

const MARKET_LEADER_PATTERNS = [/\bmarket leader\b/i, /\bleading provider\b/i, /\bbest in (the )?(market|class)\b/i, /\bnumber one\b/i, /\b#1\b/];
const ROI_PATTERNS = [/\broi\b/i, /\breturn on investment\b/i, /\bpayback\b/i];
const FINANCIAL_PATTERNS = [/\brevenue\b/i, /\bprofit\b/i, /\bmargin\b/i, /\bsavings?\b/i, /\$\s?\d/];

/**
 * Validate a claim against the safety guards. Returns [] when the claim may be
 * published to this audience; otherwise every structured rejection reason.
 */
export function validateClaim(claim: NarrativeClaim, ctx: ClaimSafetyContext): NarrativeClaimRejection[] {
  const out: NarrativeClaimRejection[] = [];
  const reject = (reason: ClaimRejectionReason, detail: string) => out.push({ claimId: claim.id, reason, detail, audience: ctx.audience });
  const text = claim.statement.text;
  const lower = text.toLowerCase();

  // ---- evidence floor: every claim except `limitation`/`unavailable` needs evidence
  if (claim.type !== "limitation" && claim.type !== "unavailable" && claim.evidenceIds.length === 0) {
    reject("unsupported_claim", "claim carries no evidence");
  }

  // ---- type-specific rules
  if (claim.type === "factual" && claim.evidenceState !== "observed") {
    reject("unsupported_claim", `factual claim rests on ${claim.evidenceState} evidence, not observed`);
  }
  if (claim.type === "estimated" && (claim.estimationBasis === null || claim.estimationBasis.trim() === "")) {
    reject("unsupported_claim", "estimated claim does not declare its estimation basis");
  }
  if (claim.type === "causal" && claim.causalSupport.length === 0) {
    reject("unsupported_causal_claim", "causal claim has no explicit supporting relationships");
  }
  if (claim.type === "unavailable" && claim.confidence > 0) {
    reject("overstated_certainty", "an unavailable-data claim may not carry positive confidence");
  }

  // ---- certainty ceiling: language may never exceed the source confidence
  const cap = ctx.toneProfile === undefined ? "very_high" : tonePolicy(ctx.toneProfile).maxCertaintyBand;
  for (const phrase of ["strongly supported", "consistently observed", "well supported", "evidence indicates"]) {
    if (lower.includes(phrase) && !isPermittedPhrase(phrase, claim.confidence, cap)) {
      reject("overstated_certainty", `'${phrase}' exceeds the permitted band for confidence ${claim.confidence}`);
    }
  }

  // ---- stale evidence presented as current
  const stale = new Set(ctx.staleBands ?? ["stale", "expired"]);
  if (claim.freshnessBand !== null && stale.has(claim.freshnessBand) && claim.limitations.length === 0) {
    reject("stale_evidence_as_current", `evidence is ${claim.freshnessBand} but no limitation is stated`);
  }

  // ---- omitted limitations on non-observed claims
  if (claim.evidenceState !== "observed" && claim.type !== "unavailable" && claim.limitations.length === 0) {
    reject("omitted_limitations", `${claim.evidenceState} claim states no limitations`);
  }

  // ---- fabricated metric: a numeric metric key with no backing record
  const metricKeys = new Set(ctx.knownMetricKeys ?? []);
  for (const [key, value] of Object.entries(claim.statement.values)) {
    if (typeof value === "number" && ctx.knownMetricKeys !== undefined && !metricKeys.has(key)) {
      reject("fabricated_metric", `metric '${key}' has no backing benchmark or evidence record`);
    }
  }

  // ---- fabricated competitor
  if (ctx.validatedCompetitorIds !== undefined) {
    const validated = new Set(ctx.validatedCompetitorIds);
    for (const [key, value] of Object.entries(claim.statement.values)) {
      if (key.toLowerCase().includes("competitor") && typeof value === "string" && value !== "" && !validated.has(value)) {
        reject("fabricated_competitor", `competitor '${value}' is not in the validated set`);
      }
    }
  }

  // ---- market-leader claims need the Sprint-10 competitor-set gate
  if (MARKET_LEADER_PATTERNS.some((p) => p.test(text)) && ctx.competitorSetSupportsMarketClaims !== true) {
    reject("market_leader_without_confidence", "market-standing claim without sufficient competitor-set confidence");
  }

  // ---- financial / ROI claims need supplied inputs
  if (FINANCIAL_PATTERNS.some((p) => p.test(text)) && ctx.financialInputsAvailable !== true) {
    reject("financial_claim_without_inputs", "financial claim without supplied financial inputs");
  }
  if (ROI_PATTERNS.some((p) => p.test(text)) && ctx.costBenefitAvailable !== true) {
    reject("roi_without_cost_benefit", "ROI claim without validated cost/benefit data");
  }

  // ---- confidentiality + terminology
  if (!sensitivityPermitted(claim.sensitivity, ctx.audience)) {
    reject("confidential_leakage", `claim sensitivity '${claim.sensitivity}' exceeds what '${ctx.audience}' may see`);
  }
  const publicish = ctx.audience === "public_visitor" || ctx.audience === "prospect";
  for (const term of ctx.internalTerminology ?? []) {
    if (publicish && lower.includes(term.toLowerCase())) reject("internal_terminology_in_public", `internal term '${term}' in ${ctx.audience} output`);
  }
  for (const term of ctx.prohibitedTerminology ?? []) {
    if (term.trim() !== "" && lower.includes(term.toLowerCase())) reject("prohibited_terminology", `prohibited term '${term}'`);
  }

  return out;
}

/** Partition claims into publishable and rejected. Deterministic (id order). Pure. */
export function screenClaims(claims: readonly NarrativeClaim[], ctx: ClaimSafetyContext): { accepted: NarrativeClaim[]; rejected: NarrativeClaimRejection[] } {
  const accepted: NarrativeClaim[] = [];
  const rejected: NarrativeClaimRejection[] = [];
  for (const claim of [...claims].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const problems = validateClaim(claim, ctx);
    if (problems.length === 0) accepted.push(claim);
    else rejected.push(...problems);
  }
  return { accepted, rejected };
}

/** Claims a given audience may see (visibility list + sensitivity). Pure. */
export function visibleTo(claims: readonly NarrativeClaim[], audience: NarrativeAudience): NarrativeClaim[] {
  return claims.filter((c) => sensitivityPermitted(c.sensitivity, audience) && (c.audienceVisibility.length === 0 || c.audienceVisibility.includes(audience)));
}
