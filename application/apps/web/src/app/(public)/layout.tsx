import type { ReactNode } from "react";
import { Footer, Navbar, PlaceholderNotice } from "@brightloop/ui";
import {
  FOOTER_COLUMNS,
  FOOTER_LEGAL,
  FOOTER_TAGLINE,
  PRIMARY_CTA,
  PRIMARY_NAV,
} from "@/lib/navigation";
import { placeholderScope } from "@/lib/repositories";

/**
 * Public marketing shell — sticky glass Navbar + MegaMenu + Footer (handoff §05).
 *
 * The placeholder notice is driven by which data sources are still sample, so it
 * narrows and then disappears on its own as each becomes real. Nobody has to
 * remember to remove it.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  const scope = placeholderScope();

  return (
    <>
      <PlaceholderNotice reputation={scope.reputation} catalog={scope.catalog} />
      <Navbar links={PRIMARY_NAV} ctaLabel={PRIMARY_CTA.label} ctaHref={PRIMARY_CTA.href} />
      <main id="main-content" tabIndex={-1}>{children}</main>
      <Footer
        columns={FOOTER_COLUMNS}
        legal={FOOTER_LEGAL}
        tagline={FOOTER_TAGLINE}
        year={2026}
      />
    </>
  );
}
