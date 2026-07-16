import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@brightloop/domain";

/**
 * robots.txt — handoff §10.4: "allows public, disallows /app and /admin".
 *
 * Our authenticated surfaces live at the /portal and /admin path prefixes (the
 * app.* and admin.* subdomains rewrite onto them), so those are what's excluded.
 *
 * robots.txt is a crawl hint, NOT an access control. The portal and admin are
 * actually protected by middleware, the layout guards and RLS — this just keeps
 * them out of the index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/portal", "/portal/", "/admin", "/admin/", "/login", "/legal/"],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
