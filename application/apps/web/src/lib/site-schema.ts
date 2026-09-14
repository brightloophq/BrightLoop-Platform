/* =============================================================================
 * Site-wide structured data — the Organization record this site never had.
 *
 * Every public page emitted JSON-LD for its own content (a case study, the
 * review aggregate) and nothing that said WHO publishes it. A crawl of the nine
 * conventional paths — home, about, contact, services, pricing, blog,
 * resources, careers, legal — touches none of those pages, so from the outside
 * the site declared no structured data at all and no organization identity.
 *
 * INTEGRITY: every field here is something the site already states publicly.
 * There is no address, no telephone, no founding date and no employee count,
 * because none of those is recorded anywhere and structured data is precisely
 * where an invented one would be taken as fact. `sameAs` appears only when
 * real profiles have been declared.
 * ========================================================================== */

import {
  CONTACT_EMAIL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SOCIAL_PROFILES,
  absoluteUrl,
  siteOrigin,
} from "./site";

export interface SiteSchemaGraph {
  "@context": "https://schema.org";
  "@graph": Record<string, unknown>[];
}

/**
 * The Organization + WebSite pair, as one `@graph` so the two records can
 * reference each other by id rather than being repeated.
 */
export function siteSchema(): SiteSchemaGraph {
  const origin = siteOrigin();
  const organizationId = `${origin}/#organization`;
  const websiteId = `${origin}/#website`;
  const profiles = SOCIAL_PROFILES.map((p) => p.href);

  const organization: Record<string, unknown> = {
    "@type": "Organization",
    "@id": organizationId,
    name: SITE_NAME,
    url: `${origin}/`,
    description: SITE_DESCRIPTION,
    email: CONTACT_EMAIL,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/brand/lockup-stacked.png"),
      width: 776,
      height: 479,
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "sales",
        email: CONTACT_EMAIL,
        url: absoluteUrl("/contact"),
        availableLanguage: "English",
      },
    ],
  };
  // Omitted rather than emitted empty: `sameAs: []` asserts "this organization
  // has no other profiles", which is a claim we have not verified.
  if (profiles.length > 0) organization["sameAs"] = profiles;

  const website: Record<string, unknown> = {
    "@type": "WebSite",
    "@id": websiteId,
    name: SITE_NAME,
    url: `${origin}/`,
    description: SITE_DESCRIPTION,
    publisher: { "@id": organizationId },
    inLanguage: "en",
  };

  return { "@context": "https://schema.org", "@graph": [organization, website] };
}
