import type { ReactNode } from "react";
import { Footer, Navbar, PlaceholderNotice } from "@brightloop/ui";
import {
  FOOTER_COLUMNS,
  FOOTER_LEGAL,
  FOOTER_TAGLINE,
  PRIMARY_CTA,
  PRIMARY_NAV,
} from "@/lib/navigation";
import { isServingPlaceholderData } from "@/lib/repositories";

/**
 * Public marketing shell — sticky glass Navbar + MegaMenu + Footer (handoff §05).
 *
 * The placeholder notice is driven by the bound data source, so it disappears
 * on its own once real content is wired. Nobody has to remember to remove it.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PlaceholderNotice active={isServingPlaceholderData()} />
      <Navbar links={PRIMARY_NAV} ctaLabel={PRIMARY_CTA.label} ctaHref={PRIMARY_CTA.href} />
      <main id="main">{children}</main>
      <Footer
        columns={FOOTER_COLUMNS}
        legal={FOOTER_LEGAL}
        tagline={FOOTER_TAGLINE}
        year={2026}
      />
    </>
  );
}
