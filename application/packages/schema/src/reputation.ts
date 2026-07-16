/* =============================================================================
 * Reputation contracts — PortfolioProject + Testimonial.
 * Ported from docs/handoff/reference/reputation-data.js, which is the canonical
 * source for these two entities (they are not in schema.js ENTITIES).
 *
 * TWO INTEGRITY RULES ARE ENCODED HERE — both are enforced in the data layer,
 * never merely in the UI:
 *   1. PUBLISH GATE — only `featured` and `public` are ever served publicly.
 *   2. METRIC DISCLOSURE — result metrics render only when `disclosed === true`
 *      AND a real value exists. Undisclosed is the default. Never fabricate.
 * ========================================================================== */

import { z } from "zod";

/* ---- Publish states -------------------------------------------------------- */

export const PUBLISH_STATES = ["featured", "public", "draft", "private"] as const;
export type PublishStatus = (typeof PUBLISH_STATES)[number];

export const PUBLISH: Record<
  PublishStatus,
  { label: string; tone: string; public: boolean; note: string }
> = {
  featured: {
    label: "Featured",
    tone: "cyan",
    public: true,
    note: "Approved & highlighted across the site.",
  },
  public: { label: "Public", tone: "success", public: true, note: "Live on the public website." },
  draft: {
    label: "Draft",
    tone: "warning",
    public: false,
    note: "Work in progress — not visible publicly.",
  },
  private: {
    label: "Private",
    tone: "neutral",
    public: false,
    note: "Client has not approved public display.",
  },
};

/** The single definition of "is this publicly visible?". */
export function isPublicPublish(publish: PublishStatus): boolean {
  return PUBLISH[publish]?.public === true;
}

/** Publish ranking for the `featured` sort: featured > public > draft > private. */
export const PUBLISH_RANK: Record<PublishStatus, number> = {
  featured: 0,
  public: 1,
  draft: 2,
  private: 3,
};

/* ---- Controlled vocabularies (filter facets) ------------------------------- */

export const FACETS = {
  industry: [
    "Agriculture",
    "Home Services",
    "Professional Services",
    "Retail & E-commerce",
    "Hospitality",
    "Health & Wellness",
    "Non-profit",
    "Technology",
  ],
  size: ["Solo / Founder", "Micro (2–10)", "Small (11–50)", "Mid-market (51–250)"],
  service: ["Brand", "Build", "Automate", "Grow"],
  country: ["Jamaica", "United States", "Canada", "United Kingdom", "Trinidad & Tobago"],
  year: [2026, 2025, 2024, 2023],
  budget: ["Under $2K", "$2K–$5K", "$5K–$10K", "$10K–$25K", "$25K+"],
  tech: [
    "Webflow",
    "WordPress",
    "Shopify",
    "Next.js",
    "HubSpot",
    "Airtable",
    "Zapier",
    "Make",
    "Google Workspace",
    "Meta Ads",
    "Klaviyo",
    "Notion",
  ],
} as const;

export type FacetName = keyof typeof FACETS;

/** The four disciplines of the loop. */
export const DISCIPLINES = ["Brand", "Build", "Automate", "Grow"] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const AWARDS = {
  featured_project: { label: "Featured Project", icon: "star" },
  editors_choice: { label: "Editor's Choice", icon: "award" },
  most_innovative: { label: "Most Innovative", icon: "lightbulb" },
  highest_roi: { label: "Highest ROI", icon: "trending-up" },
  client_favourite: { label: "Client Favourite", icon: "heart" },
} as const;

export type AwardKey = keyof typeof AWARDS;

/**
 * Result-metric definitions. Rendered ONLY where `disclosed === true` and a
 * value exists. There is deliberately no default value for any of these.
 */
export const METRIC_DEFS = [
  { key: "leadsGenerated", label: "Leads Generated", icon: "users", unit: "" },
  { key: "conversionLift", label: "Conversion Improvement", icon: "mouse-pointer-click", unit: "%" },
  { key: "timeSaved", label: "Time Saved", icon: "clock", unit: "" },
  { key: "revenueGrowth", label: "Revenue Growth", icon: "trending-up", unit: "%" },
  { key: "seoLift", label: "SEO Improvement", icon: "search", unit: "" },
  { key: "automationSavings", label: "Automation Savings", icon: "workflow", unit: "" },
] as const;

export type MetricKey = (typeof METRIC_DEFS)[number]["key"];

export const MEDIA_KINDS = ["image", "video", "youtube", "loom", "audio", "pdf", "website"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const RATING_CATEGORIES = [
  "communication",
  "quality",
  "timeliness",
  "value",
  "professionalism",
] as const;
export type RatingCategory = (typeof RATING_CATEGORIES)[number];

/* ---- Zod schemas ----------------------------------------------------------- */

export const publishStatusSchema = z.enum(PUBLISH_STATES);

export const mediaItemSchema = z.object({
  kind: z.enum(MEDIA_KINDS),
  label: z.string(),
  /** Drag-and-drop image slot id (placeholder until real media is supplied). */
  slot: z.string().optional(),
  url: z.string().optional(),
});

/**
 * Result metrics. `disclosed` gates ALL numbers. Every metric is optional and
 * has no default — an absent value must never render as zero.
 */
export const metricsSchema = z.object({
  disclosed: z.boolean(),
  leadsGenerated: z.number().nonnegative().optional(),
  conversionLift: z.number().nonnegative().optional(),
  timeSaved: z.string().optional(),
  revenueGrowth: z.number().nonnegative().optional(),
  seoLift: z.string().optional(),
  automationSavings: z.string().optional(),
});

export const seoSchema = z.object({
  title: z.string(),
  description: z.string(),
  ogImage: z.string(),
});

export const portfolioProjectSchema = z.object({
  id: z.string(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case"),
  name: z.string(),
  client: z.string(),
  industry: z.string(),
  size: z.string(),
  country: z.string(),
  year: z.number().int(),
  services: z.array(z.string()),
  budget: z.string(),
  tech: z.array(z.string()),
  platform: z.string(),
  timeline: z.string(),
  deliverablesCount: z.number().int().nonnegative(),
  completedDate: z.string(),
  projectStatus: z.string(),
  publish: publishStatusSchema,
  featuredOnHome: z.boolean(),
  awards: z.array(z.string()),
  liveUrl: z.string(),
  /** Live-site CTAs render only when this is true AND liveUrl is non-empty. */
  permissionLivePreview: z.boolean(),
  tags: z.array(z.string()),
  summary: z.string(),
  challenge: z.string(),
  approach: z.string(),
  heroSlot: z.string(),
  gallerySlots: z.array(z.string()),
  media: z.array(mediaItemSchema),
  metrics: metricsSchema,
  testimonialId: z.string().nullable(),
  seo: seoSchema,
});

export const testimonialSchema = z.object({
  id: z.string(),
  projectSlug: z.string(),
  author: z.string(),
  role: z.string(),
  company: z.string(),
  country: z.string(),
  date: z.string(),
  publish: publishStatusSchema,
  pinned: z.boolean(),
  featuredOnHome: z.boolean(),
  avatarSlot: z.string(),
  overall: z.number().min(1).max(5),
  categories: z.object({
    communication: z.number().min(1).max(5),
    quality: z.number().min(1).max(5),
    timeliness: z.number().min(1).max(5),
    value: z.number().min(1).max(5),
    professionalism: z.number().min(1).max(5),
  }),
  quote: z.string(),
  media: z.array(mediaItemSchema),
});

export type PortfolioProject = z.infer<typeof portfolioProjectSchema>;
export type Testimonial = z.infer<typeof testimonialSchema>;
export type MediaItem = z.infer<typeof mediaItemSchema>;
export type ResultMetrics = z.infer<typeof metricsSchema>;
