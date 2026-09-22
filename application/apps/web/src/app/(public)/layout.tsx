import type { ReactNode } from "react";
import { Footer, Navbar } from "@brightloop/ui";
import {
  FOOTER_COLUMNS,
  FOOTER_LEGAL,
  FOOTER_TAGLINE,
  PRIMARY_CTA,
  PRIMARY_NAV,
} from "@/lib/navigation";
import { safeJsonLd } from "@/lib/json-ld";
import { siteSchema } from "@/lib/site-schema";
import { CONTACT_EMAIL, SOCIAL_PROFILES } from "@/lib/site";
import { IntroScript } from "./_intro/IntroScript";
import { Preloader } from "./_intro/Preloader";
import "./intro.css";

/**
 * Public marketing shell — sticky glass Navbar + MegaMenu + Footer (handoff §05).
 *
 * The Organization + WebSite structured data is emitted HERE rather than on the
 * home page, so it reaches every public route. A crawler that lands on /about
 * or /services first should still learn who publishes the site.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(siteSchema()) }}
      />
      <IntroScript />
      <div className="introCover" aria-hidden="true" />
      <Preloader />
      <Navbar links={PRIMARY_NAV} ctaLabel={PRIMARY_CTA.label} ctaHref={PRIMARY_CTA.href} />
      <main id="main-content" tabIndex={-1}>{children}</main>
      <Footer
        columns={FOOTER_COLUMNS}
        legal={FOOTER_LEGAL}
        tagline={FOOTER_TAGLINE}
        year={new Date().getFullYear()}
        contactEmail={CONTACT_EMAIL}
        social={SOCIAL_PROFILES}
      />
    </>
  );
}
