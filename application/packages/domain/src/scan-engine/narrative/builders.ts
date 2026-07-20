/* =============================================================================
 * Narrative builders (Sprint 12 §8) — PURE.
 *
 * Six audience-specific builders over structured inputs. Every sentence comes
 * from a deterministic template; nothing is free-form. Each builder runs the same
 * pipeline: build sections → screen claims → validate citations → apply the length
 * budget → redact for the audience → assemble the artifact.
 *
 * Limitations and material risks are NEVER dropped silently — the budget records
 * every omission, and redaction records every removal.
 * ========================================================================== */

import type {
  CompetitorSnapshot,
  DecisionBrief,
  EngineRecommendation,
  InternalIntelligenceReport,
  MarketPosition,
  NarrativeArtifact,
  NarrativeCitation,
  NarrativeClaim,
  NarrativeRequest,
  NarrativeSection,
  NarrativeSectionType,
  ProposalArtifact,
  StatementData,
} from "@brightloop/schema";
import { statement, screenClaims, type ClaimSafetyContext } from "./claims.js";
import { validateCitations, citationsFor } from "./citations.js";
import { audiencePolicy, certaintyPhrase, lengthBudget, tonePolicy } from "./policy.js";
import { applyRedaction, lockedSections } from "./redaction.js";
import { buildSection, buildCompetitorSection, buildProposalSection, buildRecommendationSection, truncateSection } from "./sections.js";
import { buildNarrativeArtifact } from "./artifact.js";

export interface NarrativeInputs {
  report?: InternalIntelligenceReport | null;
  decisionBrief?: DecisionBrief | null;
  competitorSnapshot?: CompetitorSnapshot | null;
  marketPosition?: MarketPosition | null;
  proposal?: ProposalArtifact | null;
  recommendations?: readonly EngineRecommendation[];
  claims?: readonly NarrativeClaim[];
  citations?: readonly NarrativeCitation[];
  safety?: Partial<ClaimSafetyContext>;
}

export interface BuilderContext {
  request: NarrativeRequest;
  inputs: NarrativeInputs;
  idFor: (prefix: string) => string;
  now: string;
}

/* ---- section assembly ------------------------------------------------------- */
function coreSections(ctx: BuilderContext): NarrativeSection[] {
  const { request, inputs } = ctx;
  const tone = request.toneProfile;
  const cap = tonePolicy(tone).maxCertaintyBand;
  const out: NarrativeSection[] = [];
  const push = (s: NarrativeSection | null) => {
    if (s !== null) out.push(s);
  };

  const report = inputs.report ?? null;
  const brief = inputs.decisionBrief ?? null;

  // executive overview
  if (report !== null) {
    const body: StatementData[] = [
      statement("{findings} validated finding(s) across {domains} dimension(s).", {
        findings: report.findingsLedger.length,
        domains: report.domainSummaries.length,
      }),
    ];
    if (report.strongestRisks.length > 0) body.push(statement("{n} finding(s) are material risks.", { n: report.strongestRisks.length }));
    if (report.highestConfidenceOpportunities.length > 0) body.push(statement("{n} opportunity area(s) carry the strongest evidence.", { n: report.highestConfidenceOpportunities.length }));
    push(buildSection({
      id: ctx.idFor("sec-exec"), type: "executive_overview", title: "Overview",
      sourceData: { reportId: report.id }, body,
      evidenceIds: report.findingsLedger.flatMap((f) => f.evidenceIds).slice(0, 50),
      confidence: report.confidenceSummary?.value ?? 50,
      limitations: report.limitations,
    }));

    // health + domain summaries
    push(buildSection({
      id: ctx.idFor("sec-health"), type: "health_summary", title: "Business health",
      sourceData: { index: report.indexSummary },
      body: [statement("Index coverage spans {n} dimension(s); confidence is {phrase}.", {
        n: report.domainSummaries.length,
        phrase: certaintyPhrase(report.confidenceSummary?.value ?? 0, cap),
      })],
      evidenceIds: report.findingsLedger.flatMap((f) => f.evidenceIds).slice(0, 20),
      confidence: report.confidenceSummary?.value ?? 50,
      limitations: report.evidenceCoverage === null ? ["Evidence coverage was not computed."] : [],
    }));

    for (const d of report.domainSummaries.slice(0, 10)) {
      push(buildSection({
        id: ctx.idFor(`sec-domain-${d.domain}`), type: "domain_summary", title: `${d.domain}`,
        sourceData: { domain: d.domain, score: d.score },
        body: [statement("{domain}: {summary}", { domain: d.domain, summary: d.summary })],
        evidenceIds: [], claimIds: [], recommendationIds: [], affectedDomains: [d.domain],
        graphNodeIds: d.findingIds,
        confidence: d.score ?? 50,
      }));
    }

    // findings + risks + opportunities
    push(buildSection({
      id: ctx.idFor("sec-findings"), type: "finding_summary", title: "Findings",
      sourceData: { count: report.findingsLedger.length },
      body: report.findingsLedger.slice(0, 10).map((f) => statement("{title} — {phrase} ({severity}).", {
        title: f.title, phrase: certaintyPhrase(f.confidence.value, cap), severity: f.severity,
      })),
      evidenceIds: [...new Set(report.findingsLedger.flatMap((f) => f.evidenceIds))].sort(),
      confidence: report.confidenceSummary?.value ?? 50,
      limitations: [...new Set(report.findingsLedger.flatMap((f) => f.limitations))].sort(),
    }));

    if (report.strongestRisks.length > 0) {
      push(buildSection({
        id: ctx.idFor("sec-risk"), type: "risk_summary", title: "Material risks",
        sourceData: { ids: report.strongestRisks },
        body: [statement("{n} material risk(s) require attention.", { n: report.strongestRisks.length })],
        evidenceIds: [...new Set(report.findingsLedger.filter((f) => report.strongestRisks.includes(f.id)).flatMap((f) => f.evidenceIds))].sort(),
        confidence: report.confidenceSummary?.value ?? 50,
      }));
    }
    if (report.highestConfidenceOpportunities.length > 0) {
      push(buildSection({
        id: ctx.idFor("sec-opp"), type: "opportunity_summary", title: "Opportunities",
        sourceData: { ids: report.highestConfidenceOpportunities },
        body: [statement("{n} opportunity area(s) carry the strongest evidence.", { n: report.highestConfidenceOpportunities.length })],
        evidenceIds: [...new Set(report.findingsLedger.filter((f) => report.highestConfidenceOpportunities.includes(f.id)).flatMap((f) => f.evidenceIds))].sort(),
        confidence: report.confidenceSummary?.value ?? 50,
      }));
    }

    // evidence summary (internal/client only — redaction enforces the rest)
    push(buildSection({
      id: ctx.idFor("sec-evidence"), type: "evidence_summary", title: "Evidence base",
      sourceData: { coverage: report.evidenceCoverage },
      body: [statement("{n} evidence record(s) support this report.", { n: new Set(report.findingsLedger.flatMap((f) => f.evidenceIds)).size })],
      evidenceIds: [...new Set(report.findingsLedger.flatMap((f) => f.evidenceIds))].sort(),
      confidence: report.confidenceSummary?.value ?? 50,
      limitations: report.unavailableData.map((u) => `Unavailable: ${u}`),
    }));
  }

  // competitor + market position
  if (inputs.competitorSnapshot != null) {
    push(buildCompetitorSection({
      id: ctx.idFor("sec-competitor"), snapshot: inputs.competitorSnapshot,
      marketPosition: inputs.marketPosition ?? null, toneProfile: tone,
    }));
  }

  // recommendations
  if ((inputs.recommendations ?? []).length > 0) {
    push(buildRecommendationSection({ id: ctx.idFor("sec-recs"), recommendations: inputs.recommendations!, toneProfile: tone }));
  }

  // proposal
  if (inputs.proposal != null) {
    push(buildProposalSection({ id: ctx.idFor("sec-proposal"), proposal: inputs.proposal, toneProfile: tone }));
  }

  // confidence + limitations + next steps (meta-sections)
  const meanConfidence = out.length === 0 ? 0 : Math.round(out.reduce((a, s) => a + s.confidence, 0) / out.length);
  push(buildSection({
    id: ctx.idFor("sec-confidence"), type: "confidence_summary", title: "Confidence",
    sourceData: { mean: meanConfidence },
    body: [statement("Overall confidence is {phrase}.", { phrase: certaintyPhrase(meanConfidence, cap) })],
    confidence: meanConfidence,
  }));

  const allLimitations = [...new Set([...(report?.limitations ?? []), ...(brief?.limitations ?? []), ...out.flatMap((s) => s.limitations)])].sort();
  push(buildSection({
    id: ctx.idFor("sec-limitations"), type: "limitations", title: "Limitations",
    sourceData: { count: allLimitations.length },
    body: allLimitations.map((l) => statement("{text}", { text: l })),
    confidence: 100, limitations: allLimitations,
  }));

  if (brief !== null && brief.highestPriority.length > 0) {
    push(buildSection({
      id: ctx.idFor("sec-next"), type: "next_steps", title: "Next steps",
      sourceData: { ids: brief.highestPriority },
      body: [statement("{n} priority action(s) await review and approval.", { n: brief.highestPriority.length })],
      recommendationIds: brief.highestPriority,
      confidence: brief.confidenceSummary.mean,
    }));
  }

  return out;
}

/* ---- the shared build pipeline --------------------------------------------- */
function assemble(ctx: BuilderContext, sections: NarrativeSection[], title: string): NarrativeArtifact {
  const { request, inputs } = ctx;
  const policy = audiencePolicy(request.audience);

  // 1 · screen claims through the safety gate
  const safety: ClaimSafetyContext = {
    audience: request.audience,
    toneProfile: request.toneProfile,
    prohibitedTerminology: request.prohibitedTerminology,
    competitorSetSupportsMarketClaims: inputs.competitorSnapshot?.setConfidence?.supportsMarketClaims ?? false,
    ...inputs.safety,
  };
  const { accepted, rejected } = screenClaims(inputs.claims ?? [], safety);

  // 2 · citations
  const citationSet = citationsFor(inputs.citations ?? [], request.audience);
  const citationResult = validateCitations({ citations: citationSet, claims: accepted, audience: request.audience });
  const validCitations = citationSet.filter((c) => citationResult.valid.includes(c.id));

  // 3 · redaction FIRST — a section the audience may not see must produce its
  //     locked-section metadata regardless of any later length budget.
  const redacted = applyRedaction({ audience: request.audience, sections, claims: accepted, citations: validCitations });
  const omitted: NarrativeSectionType[] = [];
  for (const r of redacted.redactions) if (r.subject === "section" && r.sectionType !== null && !omitted.includes(r.sectionType)) omitted.push(r.sectionType);

  // 4 · length budget over what survived redaction — omissions are always recorded
  const budget = lengthBudget(request.audience, request.toneProfile, request.detailLevel, request.maxLength);
  const kept: NarrativeSection[] = [];
  let sentenceCount = 0;

  // limitations always survive the budget
  const ordered = [...redacted.sections].sort((a, b) => (a.type === "limitations" ? -1 : b.type === "limitations" ? 1 : 0));
  for (const s of ordered) {
    const { section: capped } = truncateSection(s, budget.maxSectionSentences);
    if (sentenceCount + capped.body.length > budget.maxTotalSentences && capped.type !== "limitations") {
      if (!omitted.includes(capped.type)) omitted.push(capped.type);
      continue;
    }
    sentenceCount += capped.body.length;
    kept.push(capped);
  }

  const limitations: string[] = [];
  if (omitted.length > 0) limitations.push(`${omitted.length} section(s) were omitted or redacted for this audience; see redaction metadata.`);
  if (policy.requireLimitations && !kept.some((s) => s.type === "limitations")) {
    limitations.push("Limitations section was not included for this audience — review required.");
  }
  const locked = lockedSections(redacted.redactions);
  if (locked.length > 0) limitations.push(`${locked.length} section(s) are locked and available in the full scan.`);

  return buildNarrativeArtifact({
    id: ctx.idFor("narrative"),
    requestId: request.id,
    scanId: request.scanId,
    clientId: request.clientId,
    audience: request.audience,
    purpose: request.purpose,
    title,
    sections: kept,
    claims: redacted.claims,
    citations: redacted.citations,
    rejectedClaims: rejected,
    omittedSections: [...new Set(omitted)].sort(),
    redactions: redacted.redactions,
    evidenceCoverage: inputs.report?.evidenceCoverage?.overall ?? 0,
    citationCoverage: citationResult.coverage,
    limitations,
    sourceArtifactIds: request.sourceArtifactIds,
    now: ctx.now,
  });
}

/* ---- the six builders ------------------------------------------------------- */
export function buildInternalOperatorReport(ctx: BuilderContext): NarrativeArtifact {
  return assemble(ctx, coreSections(ctx), "Internal operator report");
}
export function buildExecutiveSummary(ctx: BuilderContext): NarrativeArtifact {
  return assemble(ctx, coreSections(ctx), "Executive summary");
}
export function buildClientDiagnosis(ctx: BuilderContext): NarrativeArtifact {
  return assemble(ctx, coreSections(ctx), "Business diagnosis");
}
export function buildProposalNarrative(ctx: BuilderContext): NarrativeArtifact {
  return assemble(ctx, coreSections(ctx), "Proposal");
}
export function buildBoardSummary(ctx: BuilderContext): NarrativeArtifact {
  return assemble(ctx, coreSections(ctx), "Board summary");
}

/**
 * Public limited preview (§14): overall summary, limited issues, limited
 * opportunities, ONE next action, plus locked-section metadata. Everything else is
 * redacted with explicit reasons.
 */
export function buildPublicPreview(ctx: BuilderContext): NarrativeArtifact {
  const report = ctx.inputs.report ?? null;
  const sections: NarrativeSection[] = [];
  const body: StatementData[] = [];

  if (report !== null) {
    body.push(statement("{n} area(s) were reviewed in this preview scan.", { n: report.domainSummaries.length }));
    if (report.findingsLedger.length > 0) body.push(statement("{n} issue(s) were identified; the two most significant are shown.", { n: report.findingsLedger.length }));
    for (const f of report.findingsLedger.slice(0, 2)) body.push(statement("Issue: {title}.", { title: f.title }));
    if (report.highestConfidenceOpportunities.length > 0) body.push(statement("{n} opportunity area(s) were identified.", { n: report.highestConfidenceOpportunities.length }));
    body.push(statement("Next action: request the full scan for the complete analysis.", {}));
  }

  const preview = buildSection({
    id: ctx.idFor("sec-public"), type: "public_preview", title: "Scan preview",
    sourceData: { reportId: report?.id ?? null },
    body,
    evidenceIds: [],
    graphNodeIds: report === null ? [] : report.findingsLedger.slice(0, 2).map((f) => f.id),
    confidence: report?.confidenceSummary?.value ?? 50,
    limitations: ["This is a limited preview; the full analysis, competitor comparison, and recommendations are not included."],
  });
  if (preview !== null) sections.push(preview);

  // include the full section set so redaction records exactly what is gated
  return assemble(ctx, [...sections, ...coreSections(ctx)], "Scan preview");
}
