/**
 * Next.js configuration — single deployable app, four surfaces via route groups.
 *
 * Sprint 9 hardening: a full Content-Security-Policy + HSTS + Permissions-Policy.
 * The CSP is scoped so the app still works — Supabase (REST + Realtime websocket)
 * and Cloudflare Turnstile are the only cross-origins allowed, and only for the
 * capabilities they need (connect / script + frame).
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseHttps = supabaseUrl || "https://*.supabase.co";
const supabaseWss = supabaseUrl ? supabaseUrl.replace(/^https/, "wss") : "wss://*.supabase.co";
const turnstile = "https://challenges.cloudflare.com";

// Note: 'unsafe-inline' for script/style is a pragmatic baseline — Next injects
// inline bootstrap scripts and the app uses inline styles. Tightening to a
// nonce-based policy is a follow-up; this already blocks cross-origin script,
// framing, form hijack and object embeds.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline' ${turnstile}`,
  `frame-src ${turnstile}`,
  `connect-src 'self' ${supabaseHttps} ${supabaseWss} ${turnstile}`,
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

/**
 * `Last-Modified` for the pages whose content is fixed at build time.
 *
 * These routes render from code and compiled data, so the moment the bundle was
 * built IS the moment their content last changed — which is exactly what the
 * header means. It is deliberately NOT applied to the home page, /portfolio or
 * /testimonials: those read published CMS rows and revalidate on their own, so
 * a build timestamp there would claim a page had not changed when it had.
 *
 * A host that terminates in front of the app may override this on its own
 * responses; where it passes through, caches and crawlers get an accurate date
 * instead of none at all.
 */
const BUILD_TIME = new Date().toUTCString();

const IMMUTABLE_PAGES = [
  "/about",
  "/blog",
  "/blog/:path*",
  "/careers",
  "/contact",
  "/legal",
  "/legal/:path*",
  "/packages",
  "/resources",
  "/services",
  "/services/:path*",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The design system ships TS + CSS Modules from source; Next compiles it.
  transpilePackages: ["@brightloop/ui"],
  /**
   * Conventional paths that already exist under another name.
   *
   * `/pricing` was a 404 while `/packages` served the three plans — so a
   * prospect (and any crawler, ours included) concluded the site had no pricing
   * page at all. Permanent, because the canonical URL is `/packages`.
   */
  async redirects() {
    return [
      { source: "/pricing", destination: "/packages", permanent: true },
      { source: "/plans", destination: "/packages", permanent: true },
      { source: "/work", destination: "/portfolio", permanent: true },
      { source: "/reviews", destination: "/testimonials", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
        ],
      },
      {
        // App + admin: never cached (handoff §11.4). Framing is already denied globally.
        source: "/(portal|admin)/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      ...IMMUTABLE_PAGES.map((source) => ({
        source,
        headers: [{ key: "Last-Modified", value: BUILD_TIME }],
      })),
    ];
  },
};

export default nextConfig;
