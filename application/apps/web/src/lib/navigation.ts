import { DISCIPLINE_SLUGS, type Discipline } from "@brightloop/schema";
import type { MegaMenuItem, NavLink } from "@brightloop/ui";

/**
 * Public site navigation.
 *
 * The Services mega-menu is DERIVED from the discipline vocabulary in
 * @brightloop/schema rather than hand-listed, so the four disciplines cannot
 * drift between the nav, the routes and the catalog.
 *
 * Copy here is placeholder-grade pending real messaging (handoff §13).
 */

/** One-line mega-menu description per discipline. PLACEHOLDER copy. */
const MEGA_DESCRIPTIONS: Record<Discipline, string> = {
  Brand: "Identity, voice and guidelines that earn trust on sight.",
  Build: "Conversion-first websites and landing pages that convert.",
  Automate: "CRM, follow-up and workflows so no lead slips.",
  Grow: "Measurement, presence and campaigns that compound.",
};

const MEGA_ICONS: Record<Discipline, string> = {
  Brand: "pen-tool",
  Build: "layout-grid",
  Automate: "workflow",
  Grow: "trending-up",
};

export const SERVICES_MEGA: readonly MegaMenuItem[] = Object.entries(DISCIPLINE_SLUGS).map(
  ([slug, discipline]) => ({
    label: discipline,
    description: MEGA_DESCRIPTIONS[discipline],
    href: `/services/${slug}`,
    icon: MEGA_ICONS[discipline],
  }),
);

export const PRIMARY_NAV: readonly NavLink[] = [
  { label: "Services", href: "/services", mega: SERVICES_MEGA },
  { label: "Packages", href: "/packages" },
  { label: "Work", href: "/portfolio" },
  { label: "Contact", href: "/contact" },
];

export const PRIMARY_CTA = { label: "Book a Strategy Call", href: "/contact" };

export const FOOTER_COLUMNS = [
  {
    title: "Services",
    links: Object.entries(DISCIPLINE_SLUGS).map(([slug, discipline]) => ({
      label: discipline,
      href: `/services/${slug}`,
    })),
  },
  {
    title: "Company",
    links: [
      { label: "Packages", href: "/packages" },
      { label: "Work", href: "/portfolio" },
      { label: "Testimonials", href: "/testimonials" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Get started",
    links: [
      { label: "Business Health Assessment", href: "/assessment" },
      { label: "Package Configurator", href: "/configurator" },
      { label: "Book a Strategy Call", href: "/contact" },
    ],
  },
] as const;

export const FOOTER_LEGAL = [
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms", href: "/legal/terms" },
  { label: "Cookies", href: "/legal/cookies" },
] as const;

export const FOOTER_TAGLINE =
  "Brands. Systems. Growth. One connected loop — Brand, Build, Automate, Grow — for small businesses that want to look established and run like it.";
