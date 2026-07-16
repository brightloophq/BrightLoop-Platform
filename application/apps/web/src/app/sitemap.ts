import type { MetadataRoute } from "next";
import { SITE_ORIGIN, canonicalUrl } from "@brightloop/domain";
import { DISCIPLINE_SLUGS } from "@brightloop/schema";
import { getReputationRepository } from "@/lib/repositories";

/**
 * sitemap.xml — generated from PUBLISHED slugs (handoff §10.4).
 *
 * The sitemap is a publish-gate surface in its own right: listing an unpublished
 * project here would hand crawlers a URL the client never approved, even though
 * the page itself 404s. `listPublishedSlugs()` is gated in the repository, so
 * draft/private projects can't reach this file.
 *
 * Only the canonical /portfolio/:slug is listed — /case-studies/:slug renders the
 * same record and canonicalises to it, so listing both would compete.
 *
 * NOTE: the site is currently `noindex` at the root layout while content is
 * placeholder. This sitemap is correct and ready; it starts mattering when
 * indexing is switched on with real content.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await getReputationRepository().listPublishedSlugs();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_ORIGIN}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_ORIGIN}/services`, changeFrequency: "monthly", priority: 0.8 },
    ...Object.keys(DISCIPLINE_SLUGS).map((slug) => ({
      url: `${SITE_ORIGIN}/services/${slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_ORIGIN}/packages`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_ORIGIN}/portfolio`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_ORIGIN}/testimonials`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_ORIGIN}/contact`, changeFrequency: "yearly", priority: 0.6 },
  ];

  const projectRoutes: MetadataRoute.Sitemap = slugs.map((slug) => ({
    url: canonicalUrl("portfolio", slug),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  // Legal pages are deliberately excluded — they carry no policy yet and are
  // noindex until legal counsel supplies the copy (open decision 15).
  return [...staticRoutes, ...projectRoutes];
}
