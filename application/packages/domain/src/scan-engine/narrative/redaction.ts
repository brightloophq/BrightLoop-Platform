/* =============================================================================
 * Public-preview redaction & localization (Sprint 12 §14/§15) — PURE.
 *
 * Redaction is applied BY POLICY, and every removal is reported as explicit
 * redaction metadata with a locked-section label — content is never silently
 * dropped, and the viewer can see that something exists behind the gate.
 *
 * Localization defines formatting CONTRACTS only. No translation service.
 * ========================================================================== */

import {
  localeProfileSchema,
  narrativeRedactionSchema,
  type LocaleProfile,
  type NarrativeAudience,
  type NarrativeArtifact,
  type NarrativeCitation,
  type NarrativeClaim,
  type NarrativeRedaction,
  type NarrativeSection,
  type NarrativeSectionType,
  type RedactionReason,
} from "@brightloop/schema";
import { sectionPermitted, sensitivityPermitted } from "./policy.js";

/* ---- 14 · redaction --------------------------------------------------------- */
/** Section types that are NEVER shown to a public visitor. */
export const PUBLIC_FORBIDDEN_SECTIONS: readonly NarrativeSectionType[] = [
  "competitor_summary", "market_position", "recommendation_summary", "implementation_summary",
  "proposal_summary", "evidence_summary", "domain_summary", "risk_summary",
];

const SECTION_REDACTION_REASON: Partial<Record<NarrativeSectionType, RedactionReason>> = {
  competitor_summary: "full_competitor_set",
  market_position: "full_competitor_set",
  recommendation_summary: "internal_recommendation",
  implementation_summary: "internal_recommendation",
  proposal_summary: "proposal_strategy",
  evidence_summary: "confidential_evidence",
  domain_summary: "confidential_metric",
  risk_summary: "confidential_metric",
};

const LOCKED_LABEL: Partial<Record<NarrativeSectionType, string>> = {
  competitor_summary: "Competitive analysis — available in the full scan",
  market_position: "Market position — available in the full scan",
  recommendation_summary: "Recommended actions — available in the full scan",
  implementation_summary: "Implementation plan — available in the full scan",
  proposal_summary: "Proposal — available on request",
  evidence_summary: "Evidence detail — available in the full scan",
  domain_summary: "Per-dimension breakdown — available in the full scan",
  risk_summary: "Risk detail — available in the full scan",
};

export function redaction(subject: NarrativeRedaction["subject"], subjectId: string, reason: RedactionReason, detail: string, sectionType: NarrativeSectionType | null = null, lockedLabel: string | null = null): NarrativeRedaction {
  return narrativeRedactionSchema.parse({ subject, subjectId, sectionType, reason, detail, lockedLabel });
}

export interface RedactInput {
  audience: NarrativeAudience;
  sections: readonly NarrativeSection[];
  claims?: readonly NarrativeClaim[];
  citations?: readonly NarrativeCitation[];
}

export interface RedactResult {
  sections: NarrativeSection[];
  claims: NarrativeClaim[];
  citations: NarrativeCitation[];
  redactions: NarrativeRedaction[];
}

/**
 * Apply audience redaction. Sections not permitted for the audience, or carrying
 * sensitivity above its ceiling, are removed and recorded with a locked label.
 * Deterministic (id-ordered).
 */
export function applyRedaction(input: RedactInput): RedactResult {
  const redactions: NarrativeRedaction[] = [];
  const sections: NarrativeSection[] = [];
  const isPublic = input.audience === "public_visitor";

  for (const s of [...input.sections].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (isPublic && PUBLIC_FORBIDDEN_SECTIONS.includes(s.type)) {
      redactions.push(redaction("section", s.id, SECTION_REDACTION_REASON[s.type] ?? "section_not_permitted", `'${s.type}' is not available in the public preview`, s.type, LOCKED_LABEL[s.type] ?? "Available in the full scan"));
      continue;
    }
    if (!sectionPermitted(s.type, input.audience) && s.type !== "public_preview") {
      redactions.push(redaction("section", s.id, "section_not_permitted", `'${s.type}' is not permitted for '${input.audience}'`, s.type, LOCKED_LABEL[s.type] ?? null));
      continue;
    }
    sections.push(s);
  }

  const claims: NarrativeClaim[] = [];
  for (const c of [...(input.claims ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!sensitivityPermitted(c.sensitivity, input.audience)) {
      redactions.push(redaction("claim", c.id, "sensitivity_exceeds_audience", `claim sensitivity '${c.sensitivity}' exceeds '${input.audience}'`, null, null));
      continue;
    }
    claims.push(c);
  }

  const citations: NarrativeCitation[] = [];
  for (const c of [...(input.citations ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    // the public preview exposes no citations at all
    if (isPublic) {
      redactions.push(redaction("citation", c.id, "confidential_evidence", "citations are not exposed in the public preview", null, null));
      continue;
    }
    if (c.visibleTo.length > 0 && !c.visibleTo.includes(input.audience)) {
      redactions.push(redaction("citation", c.id, "sensitivity_exceeds_audience", `citation not visible to '${input.audience}'`, null, null));
      continue;
    }
    citations.push(c);
  }

  return { sections, claims, citations, redactions };
}

/** Locked-section metadata for the viewer — what exists but is gated. Pure. */
export function lockedSections(redactions: readonly NarrativeRedaction[]): { sectionType: NarrativeSectionType; label: string }[] {
  return redactions
    .filter((r) => r.subject === "section" && r.sectionType !== null && r.lockedLabel !== null)
    .map((r) => ({ sectionType: r.sectionType!, label: r.lockedLabel! }))
    .filter((v, i, arr) => arr.findIndex((x) => x.sectionType === v.sectionType) === i)
    .sort((a, b) => (a.sectionType < b.sectionType ? -1 : 1));
}

/** True when the artifact leaked anything above its audience ceiling. Pure. */
export function hasLeakage(artifact: NarrativeArtifact): boolean {
  return artifact.claims.some((c) => !sensitivityPermitted(c.sensitivity, artifact.audience));
}

/* ---- 15 · localization ------------------------------------------------------ */
export const DEFAULT_LOCALE = "en-US";

export const LOCALE_PROFILES: Record<string, LocaleProfile> = {
  "en-US": { locale: "en-US", spelling: "us", dateFormat: "MMM d, yyyy", numberFormat: "1,234.56", currencyDisplay: "none", terminology: {}, fallbackLocale: "en-US" },
  "en-GB": { locale: "en-GB", spelling: "uk", dateFormat: "d MMM yyyy", numberFormat: "1,234.56", currencyDisplay: "none", terminology: { optimize: "optimise", analyze: "analyse" }, fallbackLocale: "en-US" },
  "en-JM": { locale: "en-JM", spelling: "uk", dateFormat: "d MMM yyyy", numberFormat: "1,234.56", currencyDisplay: "none", terminology: { optimize: "optimise" }, fallbackLocale: "en-GB" },
};

/** Resolve a locale profile, falling back deterministically. Pure. */
export function localeProfile(locale: string): LocaleProfile {
  const direct = LOCALE_PROFILES[locale];
  if (direct !== undefined) return localeProfileSchema.parse(direct);
  const base = locale.split("-")[0];
  const match = Object.keys(LOCALE_PROFILES).find((k) => k.split("-")[0] === base);
  return localeProfileSchema.parse(match === undefined ? LOCALE_PROFILES[DEFAULT_LOCALE]! : LOCALE_PROFILES[match]!);
}

/** Apply the locale terminology dictionary to a string. Pure. */
export function localizeTerm(text: string, profile: LocaleProfile): string {
  let out = text;
  for (const [from, to] of Object.entries(profile.terminology).sort()) {
    out = out.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  }
  return out;
}
