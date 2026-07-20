/* =============================================================================
 * Assumptions, risks & exclusions (Sprint 11 §8) — PURE.
 *
 * "No hidden caveats." Every assumption, dependency, risk, exclusion, and
 * unresolved question is a first-class structured record with a source, severity,
 * impact, mitigation, owner, and review state — never buried in prose.
 *
 * Qualifiers are DERIVED from the recommendations and scope that produced them.
 * ========================================================================== */

import {
  proposalQualifierSchema,
  type EngineRecommendation,
  type ProposalItemKind,
  type ProposalQualifier,
  type ProposalScopeItem,
  type RiskBand,
} from "@brightloop/schema";
import { riskBandFor } from "./scope.js";

export interface QualifierInput {
  kind: ProposalItemKind;
  title: string;
  detail: string;
  source: string;
  severity?: RiskBand;
  probability?: number | null;
  impact?: RiskBand;
  mitigation?: string | null;
  ownerRole?: string | null;
  reviewDate?: string | null;
  confidence?: number;
  limitations?: string[];
}

/** Build a structured qualifier. Pure. */
export function buildQualifier(id: string, input: QualifierInput): ProposalQualifier {
  return proposalQualifierSchema.parse({
    id,
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    source: input.source,
    severity: input.severity ?? "unknown",
    probability: input.probability ?? null,
    impact: input.impact ?? "unknown",
    mitigation: input.mitigation ?? null,
    ownerRole: input.ownerRole ?? null,
    reviewDate: input.reviewDate ?? null,
    confidence: Math.max(0, Math.min(100, Math.round(input.confidence ?? 0))),
    limitations: input.limitations ?? [],
    reviewRequired: true,
  });
}

export interface DeriveQualifiersInput {
  idFor: (kind: ProposalItemKind, index: number) => string;
  recommendations: readonly EngineRecommendation[];
  scope?: readonly ProposalScopeItem[];
  /** Additional caller-declared qualifiers. */
  declared?: readonly QualifierInput[];
}

/**
 * Derive qualifiers from the recommendation set: each recommendation's risks,
 * constraints, limitations, and unresolved dependencies become explicit records.
 * Deterministic (id-ordered).
 */
export function deriveQualifiers(input: DeriveQualifiersInput): ProposalQualifier[] {
  const out: ProposalQualifier[] = [];
  let index = 0;
  const recs = [...input.recommendations].sort((a, b) => (a.id < b.id ? -1 : 1));
  const recIds = new Set(recs.map((r) => r.id));

  for (const rec of recs) {
    // implementation risk becomes an explicit delivery risk once it is material
    const band = riskBandFor(rec.implementationRisk);
    if (band !== "low") {
      out.push(buildQualifier(input.idFor("delivery_risk", index++), {
        kind: "delivery_risk",
        title: `Delivery risk: ${rec.title}`,
        detail: `Implementation risk is ${rec.implementationRisk}/100 (${band}).`,
        source: `recommendation:${rec.id}`,
        severity: band,
        impact: band,
        probability: 1 - rec.probabilityOfSuccess,
        confidence: rec.confidence.value,
      }));
    }
    // constraints become assumptions
    for (const constraint of rec.constraints) {
      out.push(buildQualifier(input.idFor("assumption", index++), {
        kind: "assumption", title: constraint, detail: constraint, source: `recommendation:${rec.id}`, confidence: rec.confidence.value,
      }));
    }
    // limitations become unresolved questions — surfaced, never hidden
    for (const limitation of rec.limitations) {
      out.push(buildQualifier(input.idFor("unresolved_question", index++), {
        kind: "unresolved_question", title: limitation, detail: limitation, source: `recommendation:${rec.id}`, confidence: rec.confidence.value,
      }));
    }
    // dependencies outside the selected set are client-side/technical dependencies
    for (const dep of rec.dependencies.filter((d) => !recIds.has(d))) {
      out.push(buildQualifier(input.idFor("dependency", index++), {
        kind: "dependency", title: `External prerequisite: ${dep}`, detail: `${rec.id} depends on '${dep}', which is not part of the selected scope.`,
        source: `recommendation:${rec.id}`, severity: "high", impact: "high", confidence: rec.confidence.value,
      }));
    }
    // low probability of success is a commercial risk
    if (rec.probabilityOfSuccess < 0.5) {
      out.push(buildQualifier(input.idFor("commercial_risk", index++), {
        kind: "commercial_risk", title: `Uncertain outcome: ${rec.title}`,
        detail: `Probability of success is ${Math.round(rec.probabilityOfSuccess * 100)}%.`,
        source: `recommendation:${rec.id}`, severity: "high", impact: "moderate",
        probability: 1 - rec.probabilityOfSuccess, confidence: rec.confidence.value,
      }));
    }
  }

  // excluded scope becomes an explicit exclusion record
  for (const s of (input.scope ?? []).filter((x) => x.kind === "excluded").sort((a, b) => (a.id < b.id ? -1 : 1))) {
    out.push(buildQualifier(input.idFor("exclusion", index++), {
      kind: "exclusion", title: s.title, detail: s.description, source: `scope:${s.id}`, confidence: 100,
    }));
  }

  for (const d of input.declared ?? []) out.push(buildQualifier(input.idFor(d.kind, index++), d));
  return out;
}

export function qualifiersOfKind(qualifiers: readonly ProposalQualifier[], kind: ProposalItemKind): ProposalQualifier[] {
  return qualifiers.filter((q) => q.kind === kind);
}

/** Risk kinds, for the artifact's risk section. Pure. */
const RISK_KINDS: ReadonlySet<ProposalItemKind> = new Set(["delivery_risk", "commercial_risk", "technical_risk", "client_side_risk"]);
export function risks(qualifiers: readonly ProposalQualifier[]): ProposalQualifier[] {
  return qualifiers.filter((q) => RISK_KINDS.has(q.kind));
}
