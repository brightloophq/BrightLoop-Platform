/* =============================================================================
 * Report & Narrative Engine — CONTRACTS (AIS-001 §03 Explainability · AIS-004 · PDF 27).
 *
 * Converts validated structured artifacts into audience-specific, CITATION-SAFE
 * narrative sections. Every sentence is produced from a deterministic template
 * bound to structured data — there is no free-form prose generation anywhere.
 *
 * GOVERNING RULES encoded here:
 *   · no narrative claim without evidence;
 *   · language may never be more certain than its source confidence;
 *   · unavailable data is reported as unavailable, never rewritten as certainty;
 *   · limitations and material risks are never silently dropped;
 *   · public output is redacted by policy, with explicit redaction metadata.
 *
 * NO rendering: no PDF, no HTML, no UI, no email. Data contracts only.
 *
 * NOTE ON NAMES: everything is `Narrative*`-prefixed — `Tone`, `EvidenceCitation`,
 * `ValidatedClaim`, `ProposalSection`, and `ExecutiveSummarySection` are already
 * taken by earlier modules, which stay unchanged.
 * ========================================================================== */

import { z } from "zod";
import { indexDimensionSchema, evidenceStateSchema } from "./engine.js";
import { confidenceBandSchema, freshnessBandSchema, provenanceSchema } from "./evidence.js";
import { contradictionStatusSchema } from "./reasoning.js";

export const NARRATIVE_SCHEMA_VERSION = "1.0";
export const NARRATIVE_TEMPLATE_VERSION = "narrative-1.0";

/* ---- 1 · request ----------------------------------------------------------- */
export const narrativeAudienceSchema = z.enum(["internal_operator", "executive", "client", "board", "prospect", "public_visitor"]);
export type NarrativeAudience = z.infer<typeof narrativeAudienceSchema>;

export const narrativePurposeSchema = z.enum(["diagnosis", "decision_support", "proposal", "status_update", "benchmark_summary", "public_preview"]);
export type NarrativePurpose = z.infer<typeof narrativePurposeSchema>;

export const narrativeToneProfileSchema = z.enum(["analytical", "executive", "advisory", "neutral", "concise", "persuasive_safe", "technical", "plain_language"]);
export type NarrativeToneProfile = z.infer<typeof narrativeToneProfileSchema>;

export const detailLevelSchema = z.enum(["minimal", "summary", "standard", "full"]);
export type DetailLevel = z.infer<typeof detailLevelSchema>;

export const confidentialityLevelSchema = z.enum(["public", "prospect", "client", "internal", "restricted"]);
export type ConfidentialityLevel = z.infer<typeof confidentialityLevelSchema>;

export const citationPolicySchema = z.enum(["required_all", "required_material", "on_request", "hidden"]);
export type CitationPolicy = z.infer<typeof citationPolicySchema>;

export const claimPolicySchema = z.enum(["observed_only", "observed_and_estimated", "all_labelled"]);
export type ClaimPolicy = z.infer<typeof claimPolicySchema>;

export const narrativeRequestSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  clientId: z.string().nullable(),
  audience: narrativeAudienceSchema,
  purpose: narrativePurposeSchema,
  sourceArtifactIds: z.array(z.string()).default([]),
  requestedSections: z.array(z.string()).default([]), // section types; empty = policy default
  toneProfile: narrativeToneProfileSchema,
  detailLevel: detailLevelSchema.default("standard"),
  readingLevel: z.enum(["plain", "professional", "technical"]).default("professional"),
  maxLength: z.number().int().positive().nullable().default(null), // total sentences
  citationPolicy: citationPolicySchema,
  claimPolicy: claimPolicySchema,
  confidentialityLevel: confidentialityLevelSchema,
  allowedTerminology: z.array(z.string().max(120)).default([]),
  prohibitedTerminology: z.array(z.string().max(120)).default([]),
  locale: z.string().max(20).default("en-US"),
  brandProfileRef: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type NarrativeRequest = z.infer<typeof narrativeRequestSchema>;

/* ---- 3 · claims ------------------------------------------------------------ */
export const narrativeClaimTypeSchema = z.enum(["factual", "estimated", "inferred", "comparative", "causal", "recommendation", "limitation", "unavailable"]);
export type NarrativeClaimType = z.infer<typeof narrativeClaimTypeSchema>;

export const sensitivityLevelSchema = z.enum(["public", "client", "internal", "confidential"]);
export type SensitivityLevel = z.infer<typeof sensitivityLevelSchema>;

/** Structured statement: a template id + bound values. NEVER free-form prose. */
export const statementDataSchema = z.object({
  template: z.string().max(200), // template id from the phrase library
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  /** The deterministic rendering of `template` with `values`. */
  text: z.string().max(2000),
});
export type StatementData = z.infer<typeof statementDataSchema>;

export const narrativeClaimSchema = z.object({
  id: z.string(),
  type: narrativeClaimTypeSchema,
  statement: statementDataSchema,
  evidenceIds: z.array(z.string()).default([]),
  evidenceState: evidenceStateSchema,
  confidence: z.number().min(0).max(100),
  confidenceBand: confidenceBandSchema,
  freshnessBand: freshnessBandSchema.nullable().default(null),
  contradictionStatus: contradictionStatusSchema.default("none"),
  /** For `estimated` claims: how the estimate was produced. Required by §3. */
  estimationBasis: z.string().max(500).nullable().default(null),
  /** For `causal` claims: the explicit supporting relationships. Required by §3. */
  causalSupport: z.array(z.string().max(300)).default([]),
  limitations: z.array(z.string()).default([]),
  citationIds: z.array(z.string()).default([]),
  audienceVisibility: z.array(narrativeAudienceSchema).default([]),
  sensitivity: sensitivityLevelSchema.default("internal"),
  reviewRequired: z.boolean().default(false),
  provenance: provenanceSchema.nullable().default(null),
});
export type NarrativeClaim = z.infer<typeof narrativeClaimSchema>;

/* ---- 7 · claim safety ------------------------------------------------------ */
export const claimRejectionReasonSchema = z.enum([
  "unsupported_claim",
  "fabricated_metric",
  "fabricated_competitor",
  "overstated_certainty",
  "stale_evidence_as_current",
  "unsupported_causal_claim",
  "omitted_limitations",
  "confidential_leakage",
  "internal_terminology_in_public",
  "financial_claim_without_inputs",
  "roi_without_cost_benefit",
  "market_leader_without_confidence",
  "prohibited_terminology",
]);
export type ClaimRejectionReason = z.infer<typeof claimRejectionReasonSchema>;

export const narrativeClaimRejectionSchema = z.object({
  claimId: z.string(),
  reason: claimRejectionReasonSchema,
  detail: z.string().max(1000),
  audience: narrativeAudienceSchema.nullable().default(null),
});
export type NarrativeClaimRejection = z.infer<typeof narrativeClaimRejectionSchema>;

/* ---- 6 · citations --------------------------------------------------------- */
export const citationTargetSchema = z.enum(["evidence", "graph_node", "benchmark", "finding", "recommendation", "proposal_scope", "competitor"]);
export type CitationTarget = z.infer<typeof citationTargetSchema>;

export const narrativeCitationSchema = z.object({
  id: z.string(),
  target: citationTargetSchema,
  targetId: z.string(),
  sourceUrl: z.string().max(2048).nullable().default(null),
  sourceTimestamp: z.string().nullable().default(null),
  evidenceState: evidenceStateSchema,
  freshnessBand: freshnessBandSchema.nullable().default(null),
  /** Audiences permitted to see this citation. */
  visibleTo: z.array(narrativeAudienceSchema).default([]),
  /** True when the underlying source is stale — surfaced, never hidden. */
  stale: z.boolean().default(false),
  order: z.number().int().nonnegative().default(0),
});
export type NarrativeCitation = z.infer<typeof narrativeCitationSchema>;

export const citationValidationSchema = z.object({
  valid: z.array(z.string()).default([]),
  rejected: z.array(z.object({ citationId: z.string(), reason: z.string() })).default([]),
  duplicatesRemoved: z.array(z.string()).default([]),
  staleWarnings: z.array(z.string()).default([]),
  /** Share of material claims carrying ≥1 valid citation, 0–1. */
  coverage: z.number().min(0).max(1),
});
export type CitationValidation = z.infer<typeof citationValidationSchema>;

/* ---- 2 · sections ---------------------------------------------------------- */
export const narrativeSectionTypeSchema = z.enum([
  "executive_overview",
  "business_context",
  "health_summary",
  "domain_summary",
  "finding_summary",
  "risk_summary",
  "opportunity_summary",
  "competitor_summary",
  "market_position",
  "recommendation_summary",
  "implementation_summary",
  "proposal_summary",
  "evidence_summary",
  "confidence_summary",
  "limitations",
  "next_steps",
  "public_preview",
]);
export type NarrativeSectionType = z.infer<typeof narrativeSectionTypeSchema>;

export const narrativeSectionSchema = z.object({
  id: z.string(),
  type: narrativeSectionTypeSchema,
  title: z.string().max(200),
  /** The structured data the section was built from — inspectable, not prose. */
  sourceData: z.record(z.string(), z.unknown()).default({}),
  /** Deterministically templated sentences. */
  body: z.array(statementDataSchema).default([]),
  claimIds: z.array(z.string()).default([]),
  evidenceIds: z.array(z.string()).default([]),
  graphNodeIds: z.array(z.string()).default([]),
  recommendationIds: z.array(z.string()).default([]),
  competitorIds: z.array(z.string()).default([]),
  affectedDomains: z.array(indexDimensionSchema).default([]),
  confidence: z.number().min(0).max(100),
  limitations: z.array(z.string()).default([]),
  citationIds: z.array(z.string()).default([]),
  visibility: z.array(narrativeAudienceSchema).default([]),
  reviewRequired: z.boolean().default(false),
  provenance: z.record(z.string(), z.unknown()).default({}),
  checksum: z.string(),
});
export type NarrativeSection = z.infer<typeof narrativeSectionSchema>;

/* ---- 4 · audience policy --------------------------------------------------- */
export const audiencePolicySchema = z.object({
  audience: narrativeAudienceSchema,
  detailLevel: detailLevelSchema,
  toneProfile: narrativeToneProfileSchema,
  allowedSections: z.array(narrativeSectionTypeSchema).default([]),
  maxSensitivity: sensitivityLevelSchema,
  citationPolicy: citationPolicySchema,
  claimPolicy: claimPolicySchema,
  /** Limitations must appear for this audience — never silently dropped. */
  requireLimitations: z.boolean().default(true),
  allowInternalTerminology: z.boolean().default(false),
  maxSentencesPerSection: z.number().int().positive(),
  maxTotalSentences: z.number().int().positive(),
});
export type AudiencePolicy = z.infer<typeof audiencePolicySchema>;

/* ---- 5 · tone policy ------------------------------------------------------- */
export const tonePolicySchema = z.object({
  profile: narrativeToneProfileSchema,
  maxSentenceWords: z.number().int().positive(),
  terminology: z.enum(["operational", "business", "plain", "technical"]),
  density: z.enum(["low", "medium", "high"]),
  /** Cap on how strong certainty language may be, regardless of confidence. */
  maxCertaintyBand: confidenceBandSchema,
  maxSectionSentences: z.number().int().positive(),
  useBullets: z.boolean().default(true),
  warningProminence: z.enum(["inline", "leading", "dedicated_section"]),
  limitationProminence: z.enum(["inline", "leading", "dedicated_section"]),
});
export type TonePolicy = z.infer<typeof tonePolicySchema>;

/* ---- 9 · density & length -------------------------------------------------- */
export const lengthBudgetSchema = z.object({
  maxTotalSentences: z.number().int().positive(),
  maxSectionSentences: z.number().int().positive(),
  maxCitations: z.number().int().positive(),
  /** Sections dropped by the budget — reported, never silent. */
  omittedSections: z.array(narrativeSectionTypeSchema).default([]),
  truncatedSections: z.array(narrativeSectionTypeSchema).default([]),
  omissionWarnings: z.array(z.string()).default([]),
});
export type LengthBudget = z.infer<typeof lengthBudgetSchema>;

/* ---- 14 · redaction -------------------------------------------------------- */
export const redactionReasonSchema = z.enum([
  "sensitivity_exceeds_audience",
  "section_not_permitted",
  "confidential_metric",
  "internal_recommendation",
  "full_competitor_set",
  "pricing_input",
  "proposal_strategy",
  "confidential_evidence",
]);
export type RedactionReason = z.infer<typeof redactionReasonSchema>;

export const narrativeRedactionSchema = z.object({
  subject: z.enum(["section", "claim", "citation"]),
  subjectId: z.string(),
  sectionType: narrativeSectionTypeSchema.nullable().default(null),
  reason: redactionReasonSchema,
  detail: z.string().max(500),
  /** Locked-section metadata shown to the viewer in place of content. */
  lockedLabel: z.string().max(200).nullable().default(null),
});
export type NarrativeRedaction = z.infer<typeof narrativeRedactionSchema>;

/* ---- 15 · localization ----------------------------------------------------- */
export const localeProfileSchema = z.object({
  locale: z.string().max(20),
  spelling: z.enum(["us", "uk", "intl"]),
  dateFormat: z.string().max(40),
  numberFormat: z.enum(["1,234.56", "1.234,56", "1 234,56"]),
  /** Whether currency may be displayed at all (pricing is out of scope). */
  currencyDisplay: z.enum(["none", "symbol", "code"]),
  terminology: z.record(z.string(), z.string()).default({}),
  fallbackLocale: z.string().max(20),
});
export type LocaleProfile = z.infer<typeof localeProfileSchema>;

/* ---- 16 · narrative artifact ----------------------------------------------- */
export const narrativeStatusSchema = z.enum(["draft", "validation_failed", "review_required", "approved", "superseded"]);
export type NarrativeStatus = z.infer<typeof narrativeStatusSchema>;

export const narrativeArtifactSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  scanId: z.string(),
  clientId: z.string().nullable(),
  version: z.number().int().positive(),
  status: narrativeStatusSchema.default("draft"),
  audience: narrativeAudienceSchema,
  purpose: narrativePurposeSchema,
  title: z.string().max(300),
  sections: z.array(narrativeSectionSchema).default([]),
  claims: z.array(narrativeClaimSchema).default([]),
  citations: z.array(narrativeCitationSchema).default([]),
  rejectedClaims: z.array(narrativeClaimRejectionSchema).default([]),
  omittedSections: z.array(narrativeSectionTypeSchema).default([]),
  redactions: z.array(narrativeRedactionSchema).default([]),
  confidenceSummary: z.object({
    mean: z.number().min(0).max(100),
    lowest: z.number().min(0).max(100),
    band: confidenceBandSchema,
  }),
  evidenceCoverage: z.number().min(0).max(1),
  citationCoverage: z.number().min(0).max(1),
  limitations: z.array(z.string()).default([]),
  reviewRequired: z.boolean().default(true),
  sourceArtifactIds: z.array(z.string()).default([]),
  templateVersions: z.record(z.string(), z.string()).default({}),
  provenance: z.record(z.string(), z.unknown()).default({}),
  checksum: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NarrativeArtifact = z.infer<typeof narrativeArtifactSchema>;

/* ---- 17 · versioning & review ---------------------------------------------- */
export const narrativeChangeKindSchema = z.enum(["claim_change", "citation_change", "confidence_change", "redaction_change", "section_change", "source_artifact_change"]);
export type NarrativeChangeKind = z.infer<typeof narrativeChangeKindSchema>;

export const narrativeRevisionSchema = z.object({
  fromVersion: z.number().int().positive(),
  toVersion: z.number().int().positive(),
  changes: z.array(narrativeChangeKindSchema).default([]),
  changeSummary: z.array(z.string().max(500)).default([]),
  material: z.boolean(),
  approvalReset: z.boolean(),
  at: z.string(),
});
export type NarrativeRevision = z.infer<typeof narrativeRevisionSchema>;

/* ---- 19 · events ----------------------------------------------------------- */
export const narrativeEventTypeSchema = z.enum([
  "narrative.requested",
  "narrative.section_created",
  "narrative.claim_rejected",
  "narrative.citation_added",
  "narrative.redaction_applied",
  "narrative.validation_failed",
  "narrative.review_required",
  "narrative.approved",
  "narrative.version_created",
]);
export type NarrativeEventType = z.infer<typeof narrativeEventTypeSchema>;

export const narrativeEventSchema = z.object({
  type: narrativeEventTypeSchema,
  scanId: z.string(),
  artifactId: z.string().nullable().default(null),
  audience: narrativeAudienceSchema.nullable().default(null),
  at: z.string(),
  detail: z.string().nullable().default(null),
});
export type NarrativeEvent = z.infer<typeof narrativeEventSchema>;

/* ---- 18 · pipeline stage result -------------------------------------------- */
export const narrativeSetSchema = z.object({
  scanId: z.string(),
  pipelineRunId: z.string().nullable().default(null),
  internal: narrativeArtifactSchema.nullable().default(null),
  executive: narrativeArtifactSchema.nullable().default(null),
  client: narrativeArtifactSchema.nullable().default(null),
  proposal: narrativeArtifactSchema.nullable().default(null),
  board: narrativeArtifactSchema.nullable().default(null),
  publicPreview: narrativeArtifactSchema.nullable().default(null),
  events: z.array(narrativeEventSchema).default([]),
});
export type NarrativeSet = z.infer<typeof narrativeSetSchema>;
