/* =============================================================================
 * Industry classification (Phase C · Sprint C5) — PURE, term-matched.
 *
 * Classifies the business from terms that actually appear in the evidence. The
 * taxonomy and its trigger terms are declared in full below, so a classification
 * can always be explained by the terms that produced it.
 *
 * When no category clears the support threshold the result is `null` — the
 * engine reports "not classified" rather than guessing the most likely industry.
 * ========================================================================== */

import {
  industryClassificationSchema,
  type EngineEvidenceItem,
  type IndustryClassification,
} from "@brightloop/schema";
import { itemConfidence, zeroConfidence } from "./confidence.js";

/** Minimum normalized score a category must reach to be asserted. */
export const CLASSIFICATION_THRESHOLD = 0.34;

/** The declared taxonomy. Terms are lower-cased and matched on word boundaries. */
export const INDUSTRY_TAXONOMY: readonly { category: string; terms: readonly string[] }[] = [
  { category: "professional_services", terms: ["consulting", "consultancy", "advisory", "accounting", "bookkeeping", "legal", "solicitor", "attorney"] },
  { category: "health_and_wellness", terms: ["clinic", "dental", "dentist", "therapy", "wellness", "medical", "physiotherapy", "chiropractic"] },
  { category: "hospitality", terms: ["restaurant", "cafe", "catering", "hotel", "bar", "menu", "reservations", "dining"] },
  { category: "retail", terms: ["shop", "store", "boutique", "products", "cart", "checkout", "shipping"] },
  { category: "construction_and_trades", terms: ["construction", "builder", "plumbing", "electrical", "roofing", "contractor", "renovation", "hvac"] },
  { category: "real_estate", terms: ["real estate", "realty", "property", "listings", "lettings", "mortgage"] },
  { category: "education", terms: ["school", "academy", "tutoring", "courses", "curriculum", "students", "training"] },
  { category: "technology", terms: ["software", "saas", "platform", "api", "developers", "engineering", "cloud"] },
  { category: "marketing_and_creative", terms: ["marketing", "branding", "design", "advertising", "creative", "seo", "campaigns"] },
  { category: "logistics", terms: ["logistics", "freight", "shipping", "courier", "warehouse", "fulfilment", "fulfillment"] },
  { category: "financial_services", terms: ["insurance", "loans", "investment", "wealth", "banking", "financial planning"] },
  { category: "nonprofit", terms: ["charity", "nonprofit", "non-profit", "donate", "foundation", "volunteers"] },
];

/** Text fields on an evidence item that may carry classifying terms. */
const TEXT_PATHS = ["siteTitle", "metaDescription", "visibleText", "headingText", "businessName"] as const;

function textOf(item: EngineEvidenceItem): string {
  const parts: string[] = [];
  for (const path of TEXT_PATHS) {
    const raw = item.value[path];
    if (typeof raw === "string") parts.push(raw);
  }
  const services = item.value["services"];
  if (Array.isArray(services)) for (const s of services) if (typeof s === "string") parts.push(s);
  return parts.join(" ").toLowerCase();
}

/** Whole-word (or phrase) containment — avoids "art" matching "start". */
function containsTerm(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
}

export interface IndustryInput {
  scanId: string;
  items: readonly EngineEvidenceItem[];
}

/**
 * Classify the business.
 *
 *   score = matchedTerms / totalTermsForCategory
 *
 * The winner must reach `CLASSIFICATION_THRESHOLD`; otherwise the category is
 * null and the reason is recorded as a limitation.
 */
export function classifyIndustry(input: IndustryInput): IndustryClassification {
  const usable = input.items.filter((i) => i.state !== "unavailable");
  const limitations: string[] = [];

  if (usable.length === 0) {
    return industryClassificationSchema.parse({
      scanId: input.scanId,
      category: null,
      candidates: [],
      confidence: zeroConfidence(),
      evidenceIds: [],
      limitations: ["No usable evidence, so the business could not be classified."],
    });
  }

  const candidates = INDUSTRY_TAXONOMY.map((entry) => {
    const matched = new Set<string>();
    const ids = new Set<string>();
    for (const item of usable) {
      const text = textOf(item);
      if (text === "") continue;
      for (const term of entry.terms) {
        if (containsTerm(text, term)) {
          matched.add(term);
          ids.add(item.id);
        }
      }
    }
    return {
      category: entry.category,
      matchedTerms: [...matched].sort(),
      score: entry.terms.length === 0 ? 0 : matched.size / entry.terms.length,
      evidenceIds: [...ids].sort(),
    };
  })
    .filter((c) => c.matchedTerms.length > 0)
    // Deterministic ordering: score, then match count, then name.
    .sort((a, b) => b.score - a.score || b.matchedTerms.length - a.matchedTerms.length || (a.category < b.category ? -1 : 1));

  const top = candidates[0];
  const classified = top !== undefined && top.score >= CLASSIFICATION_THRESHOLD ? top : null;

  if (candidates.length === 0) {
    limitations.push("No taxonomy term appeared in the collected text, so the business was not classified.");
  } else if (classified === null && top !== undefined) {
    limitations.push(
      `The strongest candidate (${top.category}) reached ${top.score.toFixed(2)}, below the ${CLASSIFICATION_THRESHOLD} threshold; the business is reported unclassified rather than guessed.`,
    );
  }
  if (classified !== null && candidates.length > 1 && candidates[1] !== undefined && candidates[1].score >= classified.score * 0.8) {
    limitations.push(`A second category (${candidates[1].category}) scored comparably; the classification is not decisive.`);
  }

  return industryClassificationSchema.parse({
    scanId: input.scanId,
    category: classified?.category ?? null,
    candidates: candidates.slice(0, 5),
    confidence: classified === null ? zeroConfidence() : itemConfidence(input.items, classified.evidenceIds, classified.score),
    evidenceIds: classified?.evidenceIds ?? [],
    limitations,
  });
}
