/* =============================================================================
 * Audience, tone, confidence & density policy (Sprint 12 §4/§5/§9/§10) — PURE.
 *
 * The deterministic rules that decide WHAT each audience may see, HOW firmly it
 * may be stated, and HOW MUCH may be said.
 *
 * HARD RULE (§10): certainty language may never exceed the source confidence, and
 * a tone profile may cap it further — but never raise it. `permittedBand` takes
 * the WEAKER of the two.
 * ========================================================================== */

import type {
  AudiencePolicy,
  ConfidenceBand,
  DetailLevel,
  LengthBudget,
  NarrativeAudience,
  NarrativeSectionType,
  NarrativeToneProfile,
  SensitivityLevel,
  TonePolicy,
} from "@brightloop/schema";

/* ---- 10 · confidence language ---------------------------------------------- */
/** Permitted certainty phrasing per band. Nothing stronger may ever be emitted. */
export const CONFIDENCE_LANGUAGE: Record<ConfidenceBand, readonly string[]> = {
  very_high: ["strongly supported", "consistently observed"],
  high: ["well supported", "evidence indicates"],
  moderate: ["evidence suggests", "likely"],
  low: ["limited evidence suggests", "tentative"],
  very_low: ["insufficient evidence", "cannot conclude"],
};

const BAND_RANK: Record<ConfidenceBand, number> = { very_low: 0, low: 1, moderate: 2, high: 3, very_high: 4 };
const RANK_BAND: ConfidenceBand[] = ["very_low", "low", "moderate", "high", "very_high"];

/** The band a 0–100 confidence maps to. Pure. */
export function bandFor(confidence: number): ConfidenceBand {
  if (confidence >= 85) return "very_high";
  if (confidence >= 65) return "high";
  if (confidence >= 45) return "moderate";
  if (confidence >= 25) return "low";
  return "very_low";
}

/** The WEAKER of the source band and the tone cap — never stronger. Pure. */
export function permittedBand(sourceBand: ConfidenceBand, toneCap: ConfidenceBand): ConfidenceBand {
  return RANK_BAND[Math.min(BAND_RANK[sourceBand], BAND_RANK[toneCap])]!;
}

/** The canonical certainty phrase for a band under a tone cap. Pure. */
export function certaintyPhrase(confidence: number, toneCap: ConfidenceBand = "very_high"): string {
  return CONFIDENCE_LANGUAGE[permittedBand(bandFor(confidence), toneCap)][0]!;
}

/** True when `phrase` is permitted at the given confidence. Pure. */
export function isPermittedPhrase(phrase: string, confidence: number, toneCap: ConfidenceBand = "very_high"): boolean {
  const allowed = permittedBand(bandFor(confidence), toneCap);
  const normalized = phrase.toLowerCase().trim();
  for (const band of RANK_BAND) {
    if (CONFIDENCE_LANGUAGE[band].some((p) => p === normalized)) return BAND_RANK[band] <= BAND_RANK[allowed];
  }
  return true; // not a certainty phrase at all
}

/* ---- 4 · audience policy ---------------------------------------------------- */
const ALL_SECTIONS: NarrativeSectionType[] = [
  "executive_overview", "business_context", "health_summary", "domain_summary", "finding_summary",
  "risk_summary", "opportunity_summary", "competitor_summary", "market_position", "recommendation_summary",
  "implementation_summary", "proposal_summary", "evidence_summary", "confidence_summary", "limitations", "next_steps",
];

export const AUDIENCE_POLICIES: Record<NarrativeAudience, AudiencePolicy> = {
  internal_operator: {
    audience: "internal_operator", detailLevel: "full", toneProfile: "analytical",
    allowedSections: [...ALL_SECTIONS], maxSensitivity: "confidential",
    citationPolicy: "required_all", claimPolicy: "all_labelled",
    requireLimitations: true, allowInternalTerminology: true,
    maxSentencesPerSection: 40, maxTotalSentences: 400,
  },
  executive: {
    audience: "executive", detailLevel: "summary", toneProfile: "executive",
    allowedSections: ["executive_overview", "health_summary", "risk_summary", "opportunity_summary", "recommendation_summary", "confidence_summary", "limitations", "next_steps"],
    maxSensitivity: "internal", citationPolicy: "required_material", claimPolicy: "observed_and_estimated",
    requireLimitations: true, allowInternalTerminology: false,
    maxSentencesPerSection: 6, maxTotalSentences: 40,
  },
  client: {
    audience: "client", detailLevel: "standard", toneProfile: "advisory",
    allowedSections: ["executive_overview", "business_context", "health_summary", "domain_summary", "finding_summary", "risk_summary", "opportunity_summary", "recommendation_summary", "implementation_summary", "evidence_summary", "confidence_summary", "limitations", "next_steps"],
    maxSensitivity: "client", citationPolicy: "required_material", claimPolicy: "all_labelled",
    requireLimitations: true, allowInternalTerminology: false,
    maxSentencesPerSection: 12, maxTotalSentences: 120,
  },
  board: {
    audience: "board", detailLevel: "summary", toneProfile: "executive",
    allowedSections: ["executive_overview", "health_summary", "risk_summary", "opportunity_summary", "market_position", "recommendation_summary", "confidence_summary", "limitations", "next_steps"],
    maxSensitivity: "client", citationPolicy: "required_material", claimPolicy: "observed_and_estimated",
    requireLimitations: true, allowInternalTerminology: false,
    maxSentencesPerSection: 5, maxTotalSentences: 35,
  },
  prospect: {
    audience: "prospect", detailLevel: "standard", toneProfile: "persuasive_safe",
    allowedSections: ["executive_overview", "business_context", "health_summary", "finding_summary", "opportunity_summary", "proposal_summary", "confidence_summary", "limitations", "next_steps"],
    maxSensitivity: "client", citationPolicy: "required_material", claimPolicy: "observed_and_estimated",
    requireLimitations: true, allowInternalTerminology: false,
    maxSentencesPerSection: 10, maxTotalSentences: 90,
  },
  public_visitor: {
    audience: "public_visitor", detailLevel: "minimal", toneProfile: "plain_language",
    allowedSections: ["public_preview"],
    maxSensitivity: "public", citationPolicy: "hidden", claimPolicy: "observed_only",
    requireLimitations: true, allowInternalTerminology: false,
    maxSentencesPerSection: 6, maxTotalSentences: 12,
  },
};

export function audiencePolicy(audience: NarrativeAudience): AudiencePolicy {
  return AUDIENCE_POLICIES[audience];
}

const SENSITIVITY_RANK: Record<SensitivityLevel, number> = { public: 0, client: 1, internal: 2, confidential: 3 };

/** True when content at `sensitivity` may be shown to `audience`. Pure. */
export function sensitivityPermitted(sensitivity: SensitivityLevel, audience: NarrativeAudience): boolean {
  return SENSITIVITY_RANK[sensitivity] <= SENSITIVITY_RANK[AUDIENCE_POLICIES[audience].maxSensitivity];
}

export function sectionPermitted(type: NarrativeSectionType, audience: NarrativeAudience): boolean {
  return AUDIENCE_POLICIES[audience].allowedSections.includes(type);
}

/* ---- 5 · tone policy -------------------------------------------------------- */
export const TONE_POLICIES: Record<NarrativeToneProfile, TonePolicy> = {
  analytical:      { profile: "analytical",      maxSentenceWords: 32, terminology: "operational", density: "high",   maxCertaintyBand: "very_high", maxSectionSentences: 40, useBullets: true,  warningProminence: "dedicated_section", limitationProminence: "dedicated_section" },
  executive:       { profile: "executive",       maxSentenceWords: 22, terminology: "business",    density: "low",    maxCertaintyBand: "high",      maxSectionSentences: 6,  useBullets: true,  warningProminence: "leading",            limitationProminence: "leading" },
  advisory:        { profile: "advisory",        maxSentenceWords: 26, terminology: "business",    density: "medium", maxCertaintyBand: "high",      maxSectionSentences: 12, useBullets: true,  warningProminence: "inline",             limitationProminence: "dedicated_section" },
  neutral:         { profile: "neutral",         maxSentenceWords: 26, terminology: "business",    density: "medium", maxCertaintyBand: "high",      maxSectionSentences: 12, useBullets: false, warningProminence: "inline",             limitationProminence: "inline" },
  concise:         { profile: "concise",         maxSentenceWords: 18, terminology: "business",    density: "low",    maxCertaintyBand: "high",      maxSectionSentences: 5,  useBullets: true,  warningProminence: "leading",            limitationProminence: "leading" },
  /** Persuasive but evidence-safe: certainty is capped BELOW the top band. */
  persuasive_safe: { profile: "persuasive_safe", maxSentenceWords: 24, terminology: "business",    density: "medium", maxCertaintyBand: "moderate",  maxSectionSentences: 10, useBullets: true,  warningProminence: "inline",             limitationProminence: "dedicated_section" },
  technical:       { profile: "technical",       maxSentenceWords: 34, terminology: "technical",   density: "high",   maxCertaintyBand: "very_high", maxSectionSentences: 30, useBullets: true,  warningProminence: "dedicated_section", limitationProminence: "dedicated_section" },
  plain_language:  { profile: "plain_language",  maxSentenceWords: 16, terminology: "plain",       density: "low",    maxCertaintyBand: "moderate",  maxSectionSentences: 6,  useBullets: true,  warningProminence: "leading",            limitationProminence: "leading" },
};

export function tonePolicy(profile: NarrativeToneProfile): TonePolicy {
  return TONE_POLICIES[profile];
}

/* ---- 9 · density & length --------------------------------------------------- */
const DETAIL_MULTIPLIER: Record<DetailLevel, number> = { minimal: 0.3, summary: 0.6, standard: 1, full: 1.5 };

/** Build the length budget from audience + tone + detail level. Pure. */
export function lengthBudget(audience: NarrativeAudience, profile: NarrativeToneProfile, detail: DetailLevel, maxLength?: number | null): LengthBudget {
  const ap = AUDIENCE_POLICIES[audience];
  const tp = TONE_POLICIES[profile];
  const multiplier = DETAIL_MULTIPLIER[detail];
  const sectionMax = Math.max(1, Math.round(Math.min(ap.maxSentencesPerSection, tp.maxSectionSentences) * multiplier));
  const totalMax = Math.max(1, Math.round((maxLength ?? ap.maxTotalSentences) * multiplier));
  return {
    maxTotalSentences: totalMax,
    maxSectionSentences: sectionMax,
    maxCitations: Math.max(1, totalMax * 2),
    omittedSections: [],
    truncatedSections: [],
    omissionWarnings: [],
  };
}
