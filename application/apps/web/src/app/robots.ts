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
        disallow: [
          "/portal",
          "/portal/",
          "/admin",
          "/admin/",
          // The Phase F client surface — authenticated, and previously covered
          // only by the site-wide noindex this list now has to stand in for.
          "/workspace",
          "/workspace/",
          "/login",
          "/legal/",
          // Session-scoped: the signup funnel and the wizard's result steps.
          "/start",
          "/recommendation",
          "/roadmap",
        ],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
