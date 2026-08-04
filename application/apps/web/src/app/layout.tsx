import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { ThemeProvider, ThemeScript } from "@brightloop/ui";
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
  title: {
    default: "Auxion",
    template: "%s · Auxion",
  },
  description: "Brands. Systems. Growth.",
  // Site-wide noindex while content is placeholder; flip on at launch (see
  // docs/PRE-LAUNCH.md).
  robots: { index: false, follow: false },
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
