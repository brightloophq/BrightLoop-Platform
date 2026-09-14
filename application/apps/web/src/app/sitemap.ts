import type { MetadataRoute } from "next";
import { SITE_ORIGIN, canonicalUrl } from "@brightloop/domain";
import { DISCIPLINE_SLUGS } from "@brightloop/schema";
import { getReputationRepository } from "@/lib/repositories";
import { ARTICLES } from "@/lib/blog";

/**
 * ISR, 5 min. A statically-captured sitemap would list whatever was published at
 * deploy time and never learn about new case studies — the opposite of its
 * purpose. Literal, not imported: Next requires segment config to be statically
 * analysable. Policy: lib/revalidate.ts.
 */
export const revalidate = 300;

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
 * The site is indexable, so this file is now load-bearing rather than ready:
 * every URL listed here is one a crawler is being asked to fetch. Nothing that
 * carries its own `noindex` belongs in it.
 */
/**
 * Published project slugs, or none when the read fails.
 *
 * This used to be an unguarded await, so a database hiccup made the whole of
 * sitemap.xml a 500 — losing the two dozen static routes that need no database
 * at all along with the projects that do. That cost nothing while the site was
 * noindex. It costs the entire sitemap now that crawlers actually fetch it, so
 * a failure degrades to the static routes instead, the same way the Business
 * Scan's importable-scan list already degrades rather than taking its page down.
 *
 * Returning fewer URLs is a smaller lie than returning none: a crawler keeps
 * what it already knows about a URL that is briefly absent, and picks the
 * projects back up on the next fetch.
 */
async function publishedSlugs(): Promise<string[]> {
  try {
    const repo = await getReputationRepository();
    return await repo.listPublishedSlugs();
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await publishedSlugs();

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
    { url: `${SITE_ORIGIN}/about`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_ORIGIN}/resources`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_ORIGIN}/blog`, changeFrequency: "monthly", priority: 0.6 },
    ...ARTICLES.map((article) => ({
      url: `${SITE_ORIGIN}/blog/${article.slug}`,
      lastModified: article.publishedAt,
      changeFrequency: "yearly" as const,
      priority: 0.5,
    })),
    { url: `${SITE_ORIGIN}/contact`, changeFrequency: "yearly", priority: 0.6 },
    // The two funnel entry points. /recommendation and /roadmap are absent:
    // they render the wizard's own state and carry their own `noindex`.
    { url: `${SITE_ORIGIN}/assessment`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_ORIGIN}/configurator`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_ORIGIN}/careers`, changeFrequency: "yearly", priority: 0.3 },
    // /legal and its documents are deliberately absent: they carry
    // `robots: { index: false }` because no policy has been issued, and
    // listing a noindex page in the sitemap asks a crawler to do two
    // contradictory things.
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
