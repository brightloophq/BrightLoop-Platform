/**
 * Next.js configuration — single deployable app, four surfaces via route groups.
 * Full CSP + HSTS land in the Sprint 9 hardening pass; the headers here are the
 * safe baseline that costs nothing to set now.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The design system ships TS + CSS Modules from source; Next compiles it.
  transpilePackages: ["@brightloop/ui"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
      {
        // App + admin must never be framed (handoff §11.4 frame-ancestors none).
        source: "/(portal|admin)/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
