/* =============================================================================
 * Reputation SEO — canonical URLs + JSON-LD structured data.
 * Ported from reputation-data.js `schemaFor()` / `canonicalUrl()`.
 *
 * ██ INTEGRITY RULE (handoff §10.4) ██
 * "Only published items appear in structured data. Never emit schema for
 *  unpublished or fabricated content."
 *
 * Structured data is the highest-stakes surface for the integrity rules: a
 * rating emitted here can appear as a star rating in Google results. So
 * `schemaFor()` REFUSES to build schema for an unpublished project, and refuses
 * to attach a Review from an unpublished testimonial — it returns null rather
 * than trusting the caller to have gated it.
 * ========================================================================== */

import type { PortfolioProject, Testimonial } from "@brightloop/schema";
import { isPublic } from "./query.js";

/** Production origin. Overridable so previews don't emit prod canonicals. */
export const SITE_ORIGIN = "https://brightloop.co";

export type CanonicalKind = "portfolio" | "case" | "testimonials";

/**
 * Canonical URL for a reputation page.
 * `/portfolio/:slug` is the canonical variant of a project; `/case-studies/:slug`
 * is the long-form view of the SAME record and must point back at it.
 */
export function canonicalUrl(kind: CanonicalKind, slug?: string, origin = SITE_ORIGIN): string {
  if (kind === "testimonials") return `${origin}/testimonials`;
  if (kind === "case") return `${origin}/case-studies/${slug}`;
  return `${origin}/portfolio/${slug}`;
}

export interface CreativeWorkSchema {
  "@context": "https://schema.org";
  "@type": "CreativeWork";
  name: string;
  about: string;
  creator: { "@type": "Organization"; name: "Auxion" };
  dateCreated: string;
  keywords: string;
  url: string;
  review?: {
    "@type": "Review";
    reviewRating: { "@type": "Rating"; ratingValue: number; bestRating: 5 };
    author: { "@type": "Person"; name: string };
    reviewBody: string;
  };
}

/**
 * JSON-LD for a project (CreativeWork, plus a nested Review when a PUBLISHED
 * testimonial is linked).
 *
 * Returns **null** for an unpublished project — callers must not emit anything.
 * This is deliberately fail-closed: the function will not produce schema it
 * cannot vouch for, even if a caller forgot to gate.
 */
export function schemaFor(
  project: PortfolioProject,
  testimonial: Testimonial | null = null,
  origin = SITE_ORIGIN,
): CreativeWorkSchema | null {
  if (!isPublic(project)) return null;

  const data: CreativeWorkSchema = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: `${project.name} — Case Study`,
    about: project.industry,
    creator: { "@type": "Organization", name: "Auxion" },
    dateCreated: project.completedDate,
    keywords: project.tags.join(", "),
    url: canonicalUrl("portfolio", project.slug, origin),
  };

  // A published project may link an unpublished review — never emit that rating.
  if (testimonial && isPublic(testimonial)) {
    data.review = {
      "@type": "Review",
      reviewRating: { "@type": "Rating", ratingValue: testimonial.overall, bestRating: 5 },
      author: { "@type": "Person", name: testimonial.author },
      reviewBody: testimonial.quote,
    };
  }

  return data;
}

export interface AggregateRatingSchema {
  "@context": "https://schema.org";
  "@type": "Organization";
  name: "Auxion";
  url: string;
  aggregateRating: {
    "@type": "AggregateRating";
    ratingValue: number;
    reviewCount: number;
    bestRating: 5;
    worstRating: 1;
  };
}

/**
 * Organization + AggregateRating for the testimonials page.
 *
 * Returns **null** when there are no published reviews. Emitting an
 * AggregateRating with reviewCount 0 (or a 0 ratingValue) would be asserting a
 * rating we do not have — search engines would surface it as real.
 */
export function aggregateSchema(
  rating: { count: number; overall: number },
  origin = SITE_ORIGIN,
): AggregateRatingSchema | null {
  if (rating.count <= 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Auxion",
    url: origin,
    aggregateRating: {
      "@type": "AggregateRating",
      // One decimal — don't imply precision the sample size doesn't support.
      ratingValue: Math.round(rating.overall * 10) / 10,
      reviewCount: rating.count,
      bestRating: 5,
      worstRating: 1,
    },
  };
}
