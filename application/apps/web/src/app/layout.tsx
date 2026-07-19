import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
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
  // Dark-first: Navy Ink is the primary canvas. The light theme ("Living
  // Blueprint" paper) is opt-in via [data-theme="light"] (see tokens/colors.css).
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <a href="#main-content" className="skip-link">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
