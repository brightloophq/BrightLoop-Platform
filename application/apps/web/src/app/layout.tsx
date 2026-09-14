import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { ThemeProvider, ThemeScript } from "@brightloop/ui";
import { SITE_DESCRIPTION, siteOrigin } from "@/lib/site";
import "@brightloop/ui/tokens.css";

/**
 * Brand webfonts (Auxion): Space Grotesk (display), IBM Plex Sans (body/UI), IBM Plex Mono
 * (labels/data). Loaded via next/font — self-hosted at build and served from our
 * own origin, so they need no external request and satisfy the CSP `font-src
 * 'self'` / `style-src 'self'` rules. Each exposes a CSS variable that the design
 * tokens (typography.css) reference as --font-display / --font-body / --font-mono.
 */
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-space-grotesk", display: "swap" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  // Without a metadataBase, every relative canonical and Open Graph URL below
  // resolves against localhost at build time and is dropped in production, so
  // pages that declared a canonical shipped without one.
  metadataBase: new URL(siteOrigin()),
  title: {
    default: "Auxion",
    template: "%s · Auxion",
  },
  description: SITE_DESCRIPTION,
  /**
   * The site is indexable.
   *
   * It was `index: false` site-wide while the content was placeholder — which
   * meant auxion.xyz could not appear in a search result at all, however much
   * real work was published on it. Flipped deliberately, at the owner's
   * instruction, now that the portfolio, reviews and written pages are real.
   *
   * THIS IS THE ONLY GUARD THAT USED TO COVER THE PRIVATE SURFACES. /portal,
   * /admin and /workspace inherited their `noindex` from this line and declared
   * none of their own, so each now sets its own in its layout — robots.txt is a
   * crawl hint and never a substitute. /start, /legal/*, the auth pages and the
   * funnel's result steps likewise carry their own.
   */
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Theme (PX.1a): both palettes are first-class. The user's choice is Light /
  // Dark / System (default System → follows the OS). `ThemeScript` stamps the
  // resolved `data-theme` on <html> BEFORE first paint (no flash); `ThemeProvider`
  // owns the live runtime (persistence, OS-change tracking, instant switching).
  // The SSR default (before the script runs) is the CSS `:root` = light.
  // `suppressHydrationWarning` is required because the inline script mutates
  // `data-theme` on <html> before React hydrates.
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* Anti-FOUC: runs as the first thing the body parser hits, stamping the
            resolved `data-theme` on <html> before any styled content paints. Kept
            in <body> (not a hand-rendered <head>) so it never conflicts with the
            App Router Metadata API's head management. */}
        <ThemeScript />
        <a href="#main-content" className="skip-link">Skip to content</a>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
