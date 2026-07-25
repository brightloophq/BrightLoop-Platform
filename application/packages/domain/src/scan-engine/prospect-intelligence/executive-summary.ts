/* =============================================================================
 * Executive summary (Phase C · Sprint C5) — PURE, template-assembled.
 *
 * NO free-form writing. Every sentence is produced by a NAMED template applied to
 * already-derived, already-evidenced values, and every statement records:
 *
 *   template   — which validated template produced it
 *   derivedFrom— which layer the values came from
 *   refIds     — the finding/risk/opportunity ids behind it
 *   evidenceIds— the evidence behind those
 *
 * A section with nothing evidenced to say renders an explicit
 * `unavailableReason` instead of filler. The summary always sets
 * `reviewRequired: true` — the engine never signs off on its own output.
 * ========================================================================== */

import {
  executiveSummarySchema,
  summarySectionSchema,
  type EvidenceConfidence,
  type ExecutiveSummary,
  type IndustryClassification,
  type MaturityAssessment,
  type ProspectFinding,
  type ProspectOpportunity,
  type ProspectProfile,
  type ProspectRisk,
  type SummarySection,
  type SummarySectionKey,
  type SummaryStatement,
  type TransformationReadiness,
} from "@brightloop/schema";
import { digitalMaturityBand } from "./business-profile.js";
import { readinessBand } from "./transformation-readiness.js";

/** How many items each list section reports. */
const LIST_LIMIT = 5;

const SECTION_TITLES: Record<SummarySectionKey, string> = {
  business_overview: "Business Overview",
  current_position: "Current Position",
  key_findings: "Key Findings",
  critical_risks: "Critical Risks",
  major_opportunities: "Major Opportunities",
  transformation_readiness: "Transformation Readiness",
  recommended_next_steps: "Recommended Next Steps",
};

function statement(
  template: string,
  text: string,
  derivedFrom: SummaryStatement["derivedFrom"],
  evidenceIds: readonly string[] = [],
  refIds: readonly string[] = [],
): SummaryStatement {
  return { template, text, derivedFrom, evidenceIds: [...evidenceIds], refIds: [...refIds] };
}

function section(key: SummarySectionKey, statements: SummaryStatement[], unavailableReason: string | null = null): SummarySection {
  return summarySectionSchema.parse({
    key,
    title: SECTION_TITLES[key],
    statements,
    unavailableReason: statements.length === 0 ? unavailableReason ?? "Nothing evidenced to report for this section." : null,
  });
}

export interface SummaryInput {
  scanId: string;
  profile: ProspectProfile;
  industry: IndustryClassification;
  maturity: MaturityAssessment;
  strengths: readonly ProspectFinding[];
  weaknesses: readonly ProspectFinding[];
  risks: readonly ProspectRisk[];
  opportunities: readonly ProspectOpportunity[];
  readiness: TransformationReadiness;
  confidence: EvidenceConfidence;
  now: string;
}

/* ---- section builders --------------------------------------------------------- */

function businessOverview(input: SummaryInput): SummarySection {
  const s: SummaryStatement[] = [];
  const { profile, industry } = input;

  if (profile.identity.value !== null) {
    s.push(statement("overview.identity", `${profile.identity.value} was assessed from its public website.`, "profile", profile.identity.evidenceIds));
  }
  if (profile.websiteUrl.value !== null) {
    s.push(statement("overview.website", `The assessed website is ${profile.websiteUrl.value}.`, "profile", profile.websiteUrl.evidenceIds));
  }
  if (industry.category !== null) {
    s.push(
      statement(
        "overview.industry",
        `Published content indicates a ${industry.category.replace(/_/g, " ")} business, matched on: ${(industry.candidates[0]?.matchedTerms ?? []).slice(0, 5).join(", ")}.`,
        "profile",
        industry.evidenceIds,
      ),
    );
  } else {
    s.push(statement("overview.industry_unknown", "The published content did not support an industry classification, so none is asserted.", "coverage"));
  }
  if (profile.primaryServices.length > 0) {
    s.push(statement("overview.services", `Services named on the site: ${profile.primaryServices.slice(0, LIST_LIMIT).join(", ")}.`, "profile", profile.primaryServicesEvidenceIds));
  }
  if (profile.geography.value !== null) {
    s.push(statement("overview.geography", `Published location signal: ${profile.geography.value}.`, "profile", profile.geography.evidenceIds));
  }
  if (profile.unknownFields.length > 0) {
    s.push(statement("overview.unknowns", `Not evidenced from public sources: ${profile.unknownFields.join(", ")}.`, "coverage"));
  }

  return section("business_overview", s, "No profile field could be evidenced from the collected pages.");
}

function currentPosition(input: SummaryInput): SummarySection {
  const s: SummaryStatement[] = [];
  const { maturity, profile } = input;
  const band = digitalMaturityBand(maturity.overall);

  if (maturity.overall !== null && band !== null) {
    s.push(
      statement(
        "position.composite",
        `Overall digital maturity scores ${maturity.overall}/100 (${band}), weighted across ${maturity.categories.filter((c) => c.available).length} assessable categories.`,
        "maturity",
      ),
    );
  } else {
    s.push(statement("position.unassessable", "No capability category could be scored from the available evidence, so no maturity figure is reported.", "coverage"));
  }

  s.push(
    statement(
      "position.coverage",
      `${Math.round(maturity.coverage * 100)}% of the assessment weight was observable; the remainder is reported as unknown rather than estimated.`,
      "coverage",
    ),
  );

  if (profile.websiteCompleteness.value !== null) {
    s.push(
      statement("position.completeness", `Website completeness scored ${Math.round(profile.websiteCompleteness.value * 100)}/100 on the observed structural signals.`, "profile", profile.websiteCompleteness.evidenceIds),
    );
  }

  return section("current_position", s);
}

function keyFindings(input: SummaryInput): SummarySection {
  const s: SummaryStatement[] = [];
  for (const strength of input.strengths.slice(0, LIST_LIMIT)) {
    s.push(statement("findings.strength", `Strength — ${strength.title}: ${strength.description}`, "finding", strength.evidenceIds, [strength.id]));
  }
  for (const weakness of input.weaknesses.slice(0, LIST_LIMIT)) {
    s.push(statement("findings.weakness", `Weakness — ${weakness.title}: ${weakness.description}`, "finding", weakness.evidenceIds, [weakness.id]));
  }
  return section("key_findings", s, "No category scored high or low enough to report as a finding.");
}

function criticalRisks(input: SummaryInput): SummarySection {
  const ordered = [...input.risks].sort((a, b) => b.severityScore - a.severityScore || (a.id < b.id ? -1 : 1));
  const s = ordered.slice(0, LIST_LIMIT).map((risk) =>
    statement("risks.item", `${risk.severity.toUpperCase()} (${risk.category}) — ${risk.title}: ${risk.description}`, "risk", risk.evidenceIds, [risk.id]),
  );
  return section("critical_risks", s, "No observed score was low enough to raise a risk. This is not a clean bill of health — unassessed areas remain unknown.");
}

function majorOpportunities(input: SummaryInput): SummarySection {
  const s = input.opportunities.slice(0, LIST_LIMIT).map((o) =>
    statement(
      "opportunities.item",
      `${o.title} (impact ${o.businessImpact}/100, complexity ${o.implementationComplexityBand}) — ${o.description} Routes to the ${o.recommendedWorkstream} workstream.`,
      "opportunity",
      o.evidenceIds,
      [o.id],
    ),
  );
  return section("major_opportunities", s, "No observed gap was large enough to raise an opportunity.");
}

function readinessSection(input: SummaryInput): SummarySection {
  const s: SummaryStatement[] = [];
  const { readiness } = input;
  const band = readinessBand(readiness.overall);

  if (readiness.overall !== null && band !== null) {
    s.push(statement("readiness.overall", `Transformation readiness scores ${readiness.overall}/100 (${band.replace(/_/g, " ")}).`, "readiness"));
  } else {
    s.push(statement("readiness.unassessable", "No readiness factor could be assessed, so no readiness figure is reported.", "coverage"));
  }

  for (const factor of readiness.factors.filter((f) => f.available).sort((a, b) => (a.score ?? 0) - (b.score ?? 0))) {
    s.push(
      statement("readiness.factor", `${factor.factor.replace(/_/g, " ")}: ${factor.score}/100 (weight ${factor.weight.toFixed(1)}).`, "readiness", factor.evidenceIds, [factor.factor]),
    );
  }
  if (readiness.excludedFactors.length > 0) {
    s.push(statement("readiness.excluded", `Excluded for lack of evidence: ${readiness.excludedFactors.map((f) => f.replace(/_/g, " ")).join(", ")}.`, "coverage"));
  }

  return section("transformation_readiness", s);
}

function nextSteps(input: SummaryInput): SummarySection {
  const s: SummaryStatement[] = [];

  const topRisk = [...input.risks].sort((a, b) => b.severityScore - a.severityScore || (a.id < b.id ? -1 : 1))[0];
  if (topRisk !== undefined) {
    s.push(statement("next.address_risk", `Address the highest-severity observation first: ${topRisk.title}.`, "risk", topRisk.evidenceIds, [topRisk.id]));
  }

  const topOpportunity = input.opportunities[0];
  if (topOpportunity !== undefined) {
    s.push(
      statement("next.pursue_opportunity", `Scope the highest-impact opportunity: ${topOpportunity.title} (${topOpportunity.recommendedWorkstream}).`, "opportunity", topOpportunity.evidenceIds, [
        topOpportunity.id,
      ]),
    );
  }

  const unassessed = input.maturity.categories.filter((c) => !c.available).map((c) => c.category);
  if (unassessed.length > 0) {
    s.push(statement("next.close_gaps", `Close the evidence gaps that a public crawl cannot reach — ${unassessed.join(", ")} — in a discovery conversation.`, "coverage"));
  }

  s.push(statement("next.human_review", "Review these findings with a strategist before any of them reaches the prospect. This assessment is machine-derived and requires human validation.", "coverage"));

  return section("recommended_next_steps", s);
}

/* ---- assembly ------------------------------------------------------------------ */

/** Assemble the structured executive summary. Every sentence is traceable. */
export function assembleExecutiveSummary(input: SummaryInput): ExecutiveSummary {
  const sections = [
    businessOverview(input),
    currentPosition(input),
    keyFindings(input),
    criticalRisks(input),
    majorOpportunities(input),
    readinessSection(input),
    nextSteps(input),
  ];

  const limitations: string[] = [
    ...input.profile.limitations,
    ...input.maturity.limitations,
    ...input.readiness.limitations,
    ...input.industry.limitations,
  ].filter((v, i, a) => a.indexOf(v) === i);

  if (input.confidence.value < 40) {
    limitations.push(`Overall confidence is ${input.confidence.value}/100 (${input.confidence.band}); treat every figure as indicative until more evidence is collected.`);
  }

  return executiveSummarySchema.parse({
    scanId: input.scanId,
    sections,
    confidence: input.confidence,
    limitations,
    reviewRequired: true,
    generatedAt: input.now,
  });
}

/** Every statement across the summary, for traceability assertions. */
export function allStatements(summary: ExecutiveSummary): SummaryStatement[] {
  return summary.sections.flatMap((s) => s.statements);
}
