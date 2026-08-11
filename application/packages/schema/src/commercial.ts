/* =============================================================================
 * Post-scan COMMERCIAL artifacts — Commercial Proposal + Client Narrative.
 *
 * These are PRESENTATION/composition artifacts, produced by the post-scan
 * commercial workflow by COMPOSING already-verified pipeline intelligence — the
 * C9 proposal-intelligence snapshot (the verified "recommended work"), the
 * internal report projection, and the C8 competitor snapshot. They introduce NO
 * new recommendation logic and NO new factual claims: every field is copied or
 * bounded from an upstream artifact, and every item retains the evidence ids /
 * source artifacts it came from.
 *
 * Two rules are structural, not conventional:
 *   • PRICING IS NEVER INVENTED. Absent an authoritative pricing configuration,
 *     `commercialState` is `needs_pricing` and `pricing` is null — the proposal is
 *     still `draft_ready`. Draft-ready and priced are different concepts.
 *   • The narrative is presentation only. It carries `supportingArtifacts` on
 *     every section and states unavailability plainly rather than inventing.
 * ========================================================================== */

import { z } from "zod";
import { moneySchema } from "./entities.js";
import { confidenceBandSchema } from "./evidence.js";

export const COMMERCIAL_PROPOSAL_FORMULA_VERSION = "commercial-proposal-1.0";
export const CLIENT_NARRATIVE_FORMULA_VERSION = "client-narrative-1.0";

/* ---- Admin pricing (authoritative — NEVER AI-generated) ---------------------
 * Pricing is entered by an internal admin, never synthesised. All amounts are
 * INTEGER MINOR UNITS (cents) via the house `moneySchema` — no floating point.
 * Pricing lives ON the commercial proposal envelope and is versioned through the
 * existing immutable `proposal_versions` supersede chain, so who/when is audited.
 * -------------------------------------------------------------------------- */

/** A non-negative integer minor-unit amount (cents). */
const amountMinorSchema = moneySchema.refine((n) => n >= 0, { message: "amount must be >= 0" });

/** ISO-4217 alphabetic currency code (e.g. USD). */
export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, "ISO-4217 currency code");

export const proposalPricingTypeSchema = z.enum(["one_time", "recurring"]);
export type ProposalPricingType = z.infer<typeof proposalPricingTypeSchema>;

/** Recurring cadence. Only MONTHLY today; designed to widen without a rewrite. */
export const proposalBillingCadenceSchema = z.enum(["monthly"]);
export type ProposalBillingCadence = z.infer<typeof proposalBillingCadenceSchema>;

/** Per work-item price, keyed to a `recommendedWork` item by its `sourceId`. */
export const proposalItemPricingSchema = z.object({
  /** Matches a `recommendedWork[].sourceId` — the work this price is for. */
  sourceId: z.string().min(1),
  pricingType: proposalPricingTypeSchema,
  /** Minor units (cents). */
  amountMinor: amountMinorSchema,
  /** Required iff `pricingType === "recurring"`; null for one-time. */
  cadence: proposalBillingCadenceSchema.nullable().default(null),
  quantity: z.number().int().positive().max(9999).default(1),
  /** An optional line does NOT block pricing completeness. */
  optional: z.boolean().default(false),
  adminNotes: z.string().max(500).default(""),
});
export type ProposalItemPricing = z.infer<typeof proposalItemPricingSchema>;

/** Proposal-level admin pricing. Derived totals are persisted for display but are
 * always recomputable from `items` + `discountMinor` (see computeProposalPricingTotals). */
export const proposalPricingSchema = z.object({
  currency: currencyCodeSchema,
  items: z.array(proposalItemPricingSchema).max(32),
  /** A flat one-time discount in minor units, applied to the one-time subtotal. */
  discountMinor: amountMinorSchema.default(0),
  /** Derived: one-time subtotal (before discount), one-time total (after), monthly total. */
  subtotalOneTimeMinor: amountMinorSchema,
  totalOneTimeMinor: amountMinorSchema,
  totalRecurringMonthlyMinor: amountMinorSchema,
  /** ISO date the proposal is valid until (null = unset). */
  validUntil: z.string().nullable().default(null),
  commercialNotes: z.string().max(1000).default(""),
  /** Audit: who set this pricing and when (actor id + ISO timestamp). */
  pricedBy: z.string().min(1),
  pricedAt: z.string().min(1),
});
export type ProposalPricing = z.infer<typeof proposalPricingSchema>;

/** The pricing INPUT a caller supplies — price lines only. Server derives all totals,
 * `pricedBy`/`pricedAt`, and completeness; none of those are client-trusted. */
export const setProposalPricingInputSchema = z.object({
  currency: currencyCodeSchema,
  items: z.array(proposalItemPricingSchema).max(32),
  discountMinor: amountMinorSchema.default(0),
  validUntil: z.string().max(40).nullable().default(null),
  commercialNotes: z.string().max(1000).default(""),
});
export type SetProposalPricingInput = z.input<typeof setProposalPricingInputSchema>;
export type SetProposalPricingParsed = z.infer<typeof setProposalPricingInputSchema>;

/* ---- shared ----------------------------------------------------------------- */
const commercialConfidenceSchema = z.object({
  value: z.number().min(0).max(100),
  band: confidenceBandSchema,
});

/* ---- Commercial Proposal ----------------------------------------------------- */

/** Stage-level status: a real draft was produced, or evidence was insufficient. */
export const commercialProposalStatusSchema = z.enum(["draft_ready", "insufficient_evidence"]);
export type CommercialProposalStatus = z.infer<typeof commercialProposalStatusSchema>;

/**
 * Pricing state. `needs_pricing` = no authoritative pricing configuration exists,
 * so no price is asserted (the ONLY honest state today). `priced` is reserved for
 * when an admin/config supplies authoritative commercial terms — never AI.
 */
export const commercialPricingStateSchema = z.enum(["needs_pricing", "priced"]);
export type CommercialPricingState = z.infer<typeof commercialPricingStateSchema>;

const evidencedPointSchema = z.object({
  title: z.string().min(1).max(160),
  detail: z.string().max(400),
  evidenceIds: z.array(z.string()).max(24),
});

const recommendedWorkItemSchema = z.object({
  /** The C9 proposal-intelligence item id this work traces to. */
  sourceId: z.string(),
  title: z.string().min(1).max(160),
  solution: z.string().max(400),
  priority: z.string().max(24),
  effort: z.string().max(24),
  evidenceIds: z.array(z.string()).min(1).max(24),
});

const proposalCompetitorContextSchema = z.object({
  status: z.string().max(40),
  competitorCount: z.number().int().min(0),
  marketPosition: z.string().max(40).nullable(),
  summary: z.string().max(400),
});

export const commercialProposalSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  clientId: z.string().nullable(),
  status: commercialProposalStatusSchema,
  /** Why insufficient (when status is insufficient_evidence); else null. */
  reason: z.string().max(120).nullable().default(null),
  commercialState: commercialPricingStateSchema,
  /** Authoritative admin pricing — NEVER synthesised by AI. Null until an admin
   * supplies it (the generator always emits null); filled by the pricing mutation
   * which supersedes the version. See proposalPricingSchema. */
  pricing: proposalPricingSchema.nullable().default(null),
  executiveSummary: z.string().max(1000),
  observedSituation: z.string().max(1000),
  keyIssues: z.array(evidencedPointSchema).max(6),
  opportunities: z.array(evidencedPointSchema).max(6),
  recommendedWork: z.array(recommendedWorkItemSchema).max(8),
  competitorContext: proposalCompetitorContextSchema.nullable().default(null),
  proposedNextStep: z.string().max(400),
  supportingEvidenceIds: z.array(z.string()).max(200),
  confidence: commercialConfidenceSchema,
  reviewRequired: z.boolean().default(true),
  sourceArtifacts: z.array(z.string()).max(32),
  checksum: z.string(),
  generatedAt: z.string(),
  formulaVersion: z.string().default(COMMERCIAL_PROPOSAL_FORMULA_VERSION),
});
export type CommercialProposal = z.infer<typeof commercialProposalSchema>;

/* ---- Client Narrative -------------------------------------------------------- */

export const clientNarrativeStatusSchema = z.enum(["ready", "insufficient_evidence"]);
export type ClientNarrativeStatus = z.infer<typeof clientNarrativeStatusSchema>;

/** The fixed client-facing section spine — the six questions a client asks. */
export const clientNarrativeSectionKeySchema = z.enum([
  "observed",
  "challenges",
  "opportunities",
  "recommendation",
  "rationale",
  "next_step",
]);
export type ClientNarrativeSectionKey = z.infer<typeof clientNarrativeSectionKeySchema>;

const clientNarrativeBlockSchema = z.object({
  key: clientNarrativeSectionKeySchema,
  heading: z.string().min(1).max(120),
  paragraphs: z.array(z.string().max(600)).max(4),
  /** The upstream artifact ids the paragraphs were composed from. */
  supportingArtifacts: z.array(z.string()).max(16),
});

export const clientNarrativeSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  clientId: z.string().nullable(),
  audience: z.literal("client"),
  status: clientNarrativeStatusSchema,
  reason: z.string().max(120).nullable().default(null),
  sections: z.array(clientNarrativeBlockSchema).max(6),
  confidence: commercialConfidenceSchema,
  reviewRequired: z.boolean().default(true),
  sourceArtifacts: z.array(z.string()).max(32),
  checksum: z.string(),
  generatedAt: z.string(),
  formulaVersion: z.string().default(CLIENT_NARRATIVE_FORMULA_VERSION),
});
export type ClientNarrative = z.infer<typeof clientNarrativeSchema>;
