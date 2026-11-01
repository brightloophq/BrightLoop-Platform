/* =============================================================================
 * Site identity — the one place that knows what this site IS.
 *
 * Origin, contact route and social profiles were previously scattered: the
 * canonical origin lived in a domain constant naming a different domain
 * entirely, the contact address was retyped in two page files, and there was
 * nowhere at all to declare a social profile — which is why a scan of the site
 * reports zero linked profiles and no Organization record.
 *
 * Everything here is a fact about the business, so nothing here may be guessed.
 * `SOCIAL_PROFILES` is empty on purpose: see its note.
 * ========================================================================== */

import { SITE_ORIGIN } from "@brightloop/domain";

/**
 * The origin this deployment should present as canonical.
 *
 * `NEXT_PUBLIC_SITE_ORIGIN` lets a preview deployment emit its own origin
 * instead of the production one — a preview that emits production canonicals
 * asks search engines to index the preview's content under the real URLs.
 */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_ORIGIN?.trim();
  if (!configured) return SITE_ORIGIN;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.protocol !== "http:") return SITE_ORIGIN;
    return url.origin;
  } catch {
    return SITE_ORIGIN;
  }
}

/** Absolute URL for a site-relative path. */
export function absoluteUrl(path: string): string {
  return new URL(path, `${siteOrigin()}/`).toString();
}

/** The published contact address. One definition, used everywhere. */
export const CONTACT_EMAIL = "info@auxion.xyz";

/** How the business describes itself — the Organization record's description. */
export const SITE_DESCRIPTION =
  "Auxion builds the brand, website, automation and measurement a small business needs as one connected system rather than four disconnected projects.";

export const SITE_NAME = "Auxion";

/**
 * Public profiles, emitted as `sameAs` on the Organization record and linked in
 * the footer.
 *
 * Every entry is an account the business actually holds, supplied by its owner.
 * Nothing is added here on a guess: a `sameAs` pointing at an account the
 * business does not control is a false claim of identity in structured data,
 * and a footer link to a dead profile is worse than no link.
 *
 * The Facebook entry now points at the business's own Facebook presence rather
 * than a personal profile, which is what `sameAs` on an Organization is meant
 * to identify. It is still the numeric `profile.php?id=` form; if a vanity
 * username is claimed later, swap the URL here and both surfaces follow.
 */
export const SOCIAL_PROFILES: readonly { label: string; href: string }[] = [
  { label: "Instagram", href: "https://www.instagram.com/auxion_ai/" },
  { label: "TikTok", href: "https://www.tiktok.com/@auxion_ai" },
  { label: "Facebook", href: "https://www.facebook.com/profile.php?id=61582458882522" },
];
