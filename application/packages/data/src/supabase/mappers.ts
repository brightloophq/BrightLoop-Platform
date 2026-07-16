/* =============================================================================
 * Row mappers — database (snake_case) → domain types (camelCase).
 *
 * The DB and the domain deliberately use different casing conventions, so this
 * is the one place the translation happens. If a column is renamed, this file
 * breaks loudly at typecheck rather than silently returning undefined.
 *
 * jsonb columns arrive as `Json` (unknown-ish). We coerce defensively: a
 * malformed array becomes [], never a crash. A public marketing page must not
 * 500 because one row has a bad `tags` value.
 * ========================================================================== */

import type { Tables } from "@brightloop/db";
import type {
  MediaItem,
  PortfolioProject,
  PublishStatus,
  ResultMetrics,
  Testimonial,
} from "@brightloop/schema";

type ProjectRow = Tables<"portfolio_projects">;
type TestimonialRow = Tables<"testimonials">;

/** jsonb → string[]. Anything unexpected collapses to []. */
function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/** jsonb → MediaItem[]. Entries missing a kind/label are dropped. */
function mediaArray(value: unknown): MediaItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (typeof raw !== "object" || raw === null) return [];
    const o = raw as Record<string, unknown>;
    if (typeof o["kind"] !== "string" || typeof o["label"] !== "string") return [];
    const item: MediaItem = { kind: o["kind"] as MediaItem["kind"], label: o["label"] };
    if (typeof o["slot"] === "string") item.slot = o["slot"];
    if (typeof o["url"] === "string") item.url = o["url"];
    return [item];
  });
}

/**
 * jsonb → ResultMetrics.
 *
 * INTEGRITY: `disclosed` defaults to FALSE when absent or malformed. A metrics
 * blob we cannot parse must never be treated as "the client approved these
 * numbers" — the safe reading of unknown is always "undisclosed".
 */
function metrics(value: unknown): ResultMetrics {
  if (typeof value !== "object" || value === null) return { disclosed: false };
  const o = value as Record<string, unknown>;
  const out: ResultMetrics = { disclosed: o["disclosed"] === true };
  if (typeof o["leadsGenerated"] === "number") out.leadsGenerated = o["leadsGenerated"];
  if (typeof o["conversionLift"] === "number") out.conversionLift = o["conversionLift"];
  if (typeof o["revenueGrowth"] === "number") out.revenueGrowth = o["revenueGrowth"];
  if (typeof o["timeSaved"] === "string") out.timeSaved = o["timeSaved"];
  if (typeof o["seoLift"] === "string") out.seoLift = o["seoLift"];
  if (typeof o["automationSavings"] === "string") out.automationSavings = o["automationSavings"];
  return out;
}

function seo(value: unknown): PortfolioProject["seo"] {
  const o = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    title: typeof o["title"] === "string" ? o["title"] : "",
    description: typeof o["description"] === "string" ? o["description"] : "",
    ogImage: typeof o["ogImage"] === "string" ? o["ogImage"] : "",
  };
}

function ratingCategories(value: unknown): Testimonial["categories"] {
  const o = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const num = (k: string): number => (typeof o[k] === "number" ? (o[k] as number) : 0);
  return {
    communication: num("communication"),
    quality: num("quality"),
    timeliness: num("timeliness"),
    value: num("value"),
    professionalism: num("professionalism"),
  };
}

export function toPortfolioProject(row: ProjectRow): PortfolioProject {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    client: row.client,
    industry: row.industry,
    size: row.size,
    country: row.country,
    year: row.year,
    services: strArray(row.services),
    budget: row.budget,
    tech: strArray(row.tech),
    platform: row.platform,
    timeline: row.timeline,
    deliverablesCount: row.deliverables_count,
    completedDate: row.completed_date ?? "",
    projectStatus: row.project_status,
    publish: row.publish as PublishStatus,
    featuredOnHome: row.featured_on_home,
    awards: strArray(row.awards),
    liveUrl: row.live_url,
    permissionLivePreview: row.permission_live_preview,
    tags: strArray(row.tags),
    summary: row.summary,
    challenge: row.challenge,
    approach: row.approach,
    heroSlot: row.hero_slot,
    gallerySlots: strArray(row.gallery_slots),
    media: mediaArray(row.media),
    metrics: metrics(row.metrics),
    testimonialId: row.testimonial_id,
    seo: seo(row.seo),
  };
}

export function toTestimonial(row: TestimonialRow): Testimonial {
  return {
    id: row.id,
    projectSlug: row.project_slug ?? "",
    author: row.author,
    role: row.role,
    company: row.company,
    country: row.country,
    date: row.date ?? "",
    publish: row.publish as PublishStatus,
    pinned: row.pinned,
    featuredOnHome: row.featured_on_home,
    avatarSlot: row.avatar_slot,
    overall: row.overall,
    categories: ratingCategories(row.categories),
    quote: row.quote,
    media: mediaArray(row.media),
  };
}
