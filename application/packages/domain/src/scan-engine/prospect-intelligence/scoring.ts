/* =============================================================================
 * Prospect scoring primitives (Phase C · Sprint C5) — PURE, no hidden math.
 *
 * Every score in this engine is produced here, and every score arrives with the
 * `ScoreCalculation` that generated it: the literal formula, the named inputs
 * substituted into it, the number of contributing signals, and the signals that
 * were MISSING. A reader can recompute any figure by hand from that record.
 *
 * Two rules are structural rather than conventional:
 *   1. A signal with no supporting evidence is EXCLUDED, never counted as zero.
 *      Absence of evidence is not evidence of absence.
 *   2. When a whole category is unassessable its weight is REDISTRIBUTED across
 *      the categories that were assessable, so a missing source cannot silently
 *      drag a composite down.
 * ========================================================================== */

import {
  MATURITY_CATEGORY_WEIGHTS,
  maturityCategorySchema,
  scoreCalculationSchema,
  type EngineEvidenceItem,
  type MaturityCategory,
  type ScoreCalculation,
} from "@brightloop/schema";

/* ---- 1 · the signal contract ------------------------------------------------ */

/** How a raw evidence value becomes a 0–1 signal. */
export type SignalKind =
  /** Present and truthy → 1; present and falsy → 0; absent → missing. */
  | "boolean"
  /** `path / denominatorPath`, clamped to 0–1. Absent either side → missing. */
  | "ratio"
  /** `min(path / target, 1)`. Absent → missing. */
  | "count";

export interface SignalSpec {
  /** Stable, documented signal name — appears verbatim in the calculation. */
  key: string;
  category: MaturityCategory;
  /** Relative weight WITHIN the category. */
  weight: number;
  kind: SignalKind;
  /** Key read from an evidence item's normalized `value` payload. */
  path: string;
  denominatorPath?: string;
  target?: number;
  description: string;
}

/** A signal that actually resolved, with the evidence that produced it. */
export interface ResolvedSignal {
  key: string;
  category: MaturityCategory;
  weight: number;
  /** Normalized 0–1. */
  value: number;
  evidenceIds: string[];
}

/* ---- 2 · the registry -------------------------------------------------------- */

/**
 * The complete signal registry. Each entry documents exactly which normalized
 * evidence key it reads, so the mapping from a crawled page to a score is
 * inspectable rather than implicit.
 *
 * Categories with no registry entry (or whose entries never resolve) are
 * reported `available: false` — the engine does not invent a proxy for them.
 */
export const SIGNAL_REGISTRY: readonly SignalSpec[] = [
  // website — does a usable, structurally complete site exist?
  { key: "website.reachable", category: "website", weight: 3, kind: "boolean", path: "pageFetched", description: "At least one page was fetched successfully." },
  { key: "website.has_title", category: "website", weight: 2, kind: "boolean", path: "hasTitle", description: "The page declares a <title>." },
  { key: "website.page_coverage", category: "website", weight: 3, kind: "ratio", path: "pagesFetched", denominatorPath: "pagesPlanned", description: "Share of planned pages that returned content." },
  { key: "website.viewport", category: "website", weight: 1, kind: "boolean", path: "hasViewportMeta", description: "A responsive viewport meta tag is present." },
  { key: "website.language", category: "website", weight: 1, kind: "boolean", path: "hasLangAttribute", description: "The document declares a language." },

  // seo — is the site legible to search engines?
  { key: "seo.title", category: "seo", weight: 2, kind: "boolean", path: "hasTitle", description: "A <title> is present." },
  { key: "seo.meta_description", category: "seo", weight: 2, kind: "boolean", path: "hasMetaDescription", description: "A meta description is present." },
  { key: "seo.canonical", category: "seo", weight: 2, kind: "boolean", path: "hasCanonical", description: "A canonical URL is declared." },
  { key: "seo.single_h1", category: "seo", weight: 2, kind: "boolean", path: "hasSingleH1", description: "Exactly one <h1> is present." },
  { key: "seo.structured_data", category: "seo", weight: 2, kind: "count", path: "jsonLdTypeCount", target: 2, description: "JSON-LD structured data types found." },

  // branding — is the brand presented consistently?
  { key: "branding.title_present", category: "branding", weight: 2, kind: "boolean", path: "hasTitle", description: "A brand-bearing title exists." },
  { key: "branding.social_profiles", category: "branding", weight: 2, kind: "count", path: "socialLinkCount", target: 3, description: "Linked social profiles." },
  { key: "branding.organization_schema", category: "branding", weight: 2, kind: "boolean", path: "hasOrganizationSchema", description: "Organization structured data is declared." },

  // trust — would a buyer believe this business is real and safe?
  { key: "trust.https", category: "trust", weight: 3, kind: "boolean", path: "isHttps", description: "The site is served over HTTPS." },
  { key: "trust.contact_details", category: "trust", weight: 2, kind: "boolean", path: "hasContactDetails", description: "A public email or phone is published." },
  { key: "trust.policy_pages", category: "trust", weight: 2, kind: "count", path: "policyPageCount", target: 2, description: "Legal/policy pages found." },
  { key: "trust.security_headers", category: "trust", weight: 2, kind: "ratio", path: "securityHeadersPresent", denominatorPath: "securityHeadersChecked", description: "Share of checked security headers present." },

  // accessibility — can everyone use it?
  { key: "accessibility.image_alt", category: "accessibility", weight: 3, kind: "ratio", path: "imagesWithAlt", denominatorPath: "imageCount", description: "Share of images carrying alt text." },
  { key: "accessibility.lang", category: "accessibility", weight: 2, kind: "boolean", path: "hasLangAttribute", description: "A document language is declared." },
  { key: "accessibility.viewport", category: "accessibility", weight: 2, kind: "boolean", path: "hasViewportMeta", description: "A responsive viewport is declared." },

  // content — is there enough substance to sell from?
  { key: "content.depth", category: "content", weight: 3, kind: "count", path: "wordCount", target: 600, description: "Words of visible copy on the page." },
  { key: "content.headings", category: "content", weight: 2, kind: "count", path: "headingCount", target: 5, description: "Structural headings present." },
  { key: "content.blog_present", category: "content", weight: 2, kind: "boolean", path: "hasBlog", description: "A blog or resources index exists." },
  { key: "content.freshness", category: "content", weight: 2, kind: "boolean", path: "hasFreshnessSignal", description: "A last-modified or dated signal is published." },

  // lead_capture — can a visitor become a lead?
  { key: "lead_capture.form", category: "lead_capture", weight: 3, kind: "count", path: "formCount", target: 1, description: "Enquiry forms present." },
  { key: "lead_capture.contact_page", category: "lead_capture", weight: 2, kind: "boolean", path: "hasContactPage", description: "A dedicated contact page exists." },
  { key: "lead_capture.direct_contact", category: "lead_capture", weight: 2, kind: "boolean", path: "hasContactDetails", description: "A direct email or phone is published." },

  // performance — transfer weight is the only honest signal without a lab run.
  { key: "performance.payload", category: "performance", weight: 3, kind: "ratio", path: "payloadBudgetRemaining", denominatorPath: "payloadBudget", description: "Share of the page-weight budget left unused." },

  // customer_journey — is there a path from interest to enquiry?
  { key: "customer_journey.services_page", category: "customer_journey", weight: 3, kind: "boolean", path: "hasServicesPage", description: "A services or products page exists." },
  { key: "customer_journey.pricing_page", category: "customer_journey", weight: 2, kind: "boolean", path: "hasPricingPage", description: "Pricing is published." },
  { key: "customer_journey.about_page", category: "customer_journey", weight: 2, kind: "boolean", path: "hasAboutPage", description: "An about page exists." },
  { key: "customer_journey.internal_linking", category: "customer_journey", weight: 2, kind: "count", path: "internalLinkCount", target: 10, description: "Internal links available to navigate." },

  // social_presence
  { key: "social_presence.profiles", category: "social_presence", weight: 3, kind: "count", path: "socialLinkCount", target: 3, description: "Distinct social profiles linked." },
];

/** Registry entries for one category, in stable key order. */
export function signalsFor(category: MaturityCategory): SignalSpec[] {
  return SIGNAL_REGISTRY.filter((s) => s.category === category).sort((a, b) => (a.key < b.key ? -1 : 1));
}

/**
 * Categories with NO registry coverage at all. They are reported unavailable
 * with an explicit limitation rather than silently scored — the evidence sources
 * that would inform them (analytics, automation tooling, internal operations)
 * are not observable from a public crawl.
 */
export const UNCOVERED_CATEGORIES: readonly MaturityCategory[] = maturityCategorySchema.options.filter(
  (c) => !SIGNAL_REGISTRY.some((s) => s.category === c),
);

/* ---- 3 · signal extraction ---------------------------------------------------- */

function numberAt(item: EngineEvidenceItem, path: string): number | null {
  const raw = item.value[path];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "boolean") return raw ? 1 : 0;
  return null;
}

function booleanAt(item: EngineEvidenceItem, path: string): boolean | null {
  const raw = item.value[path];
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw > 0;
  return null;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Resolve ONE spec against ONE evidence item, or null when unsupported. */
function resolveOne(spec: SignalSpec, item: EngineEvidenceItem): number | null {
  switch (spec.kind) {
    case "boolean": {
      const b = booleanAt(item, spec.path);
      return b === null ? null : b ? 1 : 0;
    }
    case "ratio": {
      const n = numberAt(item, spec.path);
      const d = spec.denominatorPath === undefined ? null : numberAt(item, spec.denominatorPath);
      if (n === null || d === null || d <= 0) return null;
      return clamp01(n / d);
    }
    case "count": {
      const n = numberAt(item, spec.path);
      const target = spec.target ?? 1;
      if (n === null || target <= 0) return null;
      return clamp01(n / target);
    }
  }
}

export interface SignalExtraction {
  resolved: ResolvedSignal[];
  /** Signal keys with no supporting evidence — excluded from every formula. */
  missing: string[];
}

/**
 * Extract signals for a category from evidence.
 *
 * `unavailable` items are skipped entirely: an unconnected or unreachable source
 * contributes nothing and can never lower a score. When several items support the
 * same signal, their values are AVERAGED and every contributing evidence id is
 * retained, so traceability survives aggregation.
 */
export function extractSignals(items: readonly EngineEvidenceItem[], specs: readonly SignalSpec[]): SignalExtraction {
  const usable = items.filter((i) => i.state !== "unavailable");
  const resolved: ResolvedSignal[] = [];
  const missing: string[] = [];

  for (const spec of [...specs].sort((a, b) => (a.key < b.key ? -1 : 1))) {
    const hits: { value: number; id: string }[] = [];
    for (const item of usable) {
      const value = resolveOne(spec, item);
      if (value !== null) hits.push({ value, id: item.id });
    }
    if (hits.length === 0) {
      missing.push(spec.key);
      continue;
    }
    const mean = hits.reduce((a, h) => a + h.value, 0) / hits.length;
    resolved.push({
      key: spec.key,
      category: spec.category,
      weight: spec.weight,
      value: clamp01(mean),
      evidenceIds: [...new Set(hits.map((h) => h.id))].sort(),
    });
  }

  return { resolved, missing };
}

/* ---- 4 · the formulas ---------------------------------------------------------- */

const round = (n: number) => Math.round(n);

/**
 * Weighted signal score.
 *
 *   score = round( 100 × Σ(wᵢ × sᵢ) / Σwᵢ )   over RESOLVED signals only
 *
 * Missing signals are absent from both sums — they neither raise nor lower the
 * result. Returns null when nothing resolved (unassessable, not zero).
 */
export function weightedSignalScore(resolved: readonly ResolvedSignal[], missing: readonly string[]): { score: number | null; calculation: ScoreCalculation } {
  const inputs: Record<string, number> = {};
  for (const s of resolved) {
    inputs[s.key] = Number(s.value.toFixed(4));
    inputs[`${s.key}.weight`] = s.weight;
  }

  if (resolved.length === 0) {
    return {
      score: null,
      calculation: scoreCalculationSchema.parse({
        formula: "unassessable — no signal resolved from the available evidence",
        inputs,
        signalCount: 0,
        missingSignals: [...missing].sort(),
      }),
    };
  }

  const weightSum = resolved.reduce((a, s) => a + s.weight, 0);
  const weighted = resolved.reduce((a, s) => a + s.weight * s.value, 0);
  const score = weightSum === 0 ? 0 : round((100 * weighted) / weightSum);

  inputs["weightedSum"] = Number(weighted.toFixed(4));
  inputs["weightSum"] = weightSum;

  return {
    score,
    calculation: scoreCalculationSchema.parse({
      formula: "round(100 * Σ(weightᵢ × signalᵢ) / Σweightᵢ) over resolved signals",
      inputs,
      signalCount: resolved.length,
      missingSignals: [...missing].sort(),
    }),
  };
}

/**
 * Redistribute a weight map across the AVAILABLE keys so the applied weights sum
 * to 100 again.
 *
 *   appliedWeightₖ = baseWeightₖ × 100 / Σ baseWeight(available)
 *
 * An unavailable key gets weight 0 — it is excluded from the composite, not
 * scored as zero. Returns all-zero when nothing is available.
 */
export function redistributeWeights<K extends string>(base: Record<K, number>, available: readonly NoInfer<K>[]): Record<K, number> {
  const availableSet = new Set(available);
  const total = (Object.keys(base) as K[]).filter((k) => availableSet.has(k)).reduce((a, k) => a + base[k], 0);

  const out = {} as Record<K, number>;
  for (const key of Object.keys(base) as K[]) {
    out[key] = availableSet.has(key) && total > 0 ? (base[key] * 100) / total : 0;
  }
  return out;
}

/** The share of total base weight that was assessable (0–1). */
export function weightCoverage<K extends string>(base: Record<K, number>, available: readonly NoInfer<K>[]): number {
  const total = (Object.keys(base) as K[]).reduce((a, k) => a + base[k], 0);
  if (total === 0) return 0;
  const availableSet = new Set(available);
  const covered = (Object.keys(base) as K[]).filter((k) => availableSet.has(k)).reduce((a, k) => a + base[k], 0);
  return covered / total;
}

/**
 * Weighted composite over parts that carry a score.
 *
 *   composite = round( Σ(appliedWeightₖ × scoreₖ) / 100 )
 *
 * Null when no part is scoreable.
 */
export function weightedComposite(
  parts: readonly { key: string; score: number | null; weight: number }[],
  formula: string,
  missing: readonly string[],
): { score: number | null; calculation: ScoreCalculation } {
  const scored = parts.filter((p): p is { key: string; score: number; weight: number } => p.score !== null && p.weight > 0);
  const inputs: Record<string, number> = {};
  for (const p of scored) {
    inputs[p.key] = p.score;
    inputs[`${p.key}.weight`] = Number(p.weight.toFixed(4));
  }

  if (scored.length === 0) {
    return {
      score: null,
      calculation: scoreCalculationSchema.parse({
        formula: "unassessable — no component carried a score",
        inputs,
        signalCount: 0,
        missingSignals: [...missing].sort(),
      }),
    };
  }

  const weightSum = scored.reduce((a, p) => a + p.weight, 0);
  const total = scored.reduce((a, p) => a + p.weight * p.score, 0);
  inputs["appliedWeightSum"] = Number(weightSum.toFixed(4));

  return {
    score: round(total / (weightSum === 0 ? 1 : weightSum)),
    calculation: scoreCalculationSchema.parse({
      formula,
      inputs,
      signalCount: scored.length,
      missingSignals: [...missing].sort(),
    }),
  };
}

/** The canonical base weights, re-exported so callers never redeclare them. */
export const CATEGORY_WEIGHTS = MATURITY_CATEGORY_WEIGHTS;
