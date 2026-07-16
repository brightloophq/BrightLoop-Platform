import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@brightloop/ui/tokens.css";

export const metadata: Metadata = {
  title: {
    default: "BrightLoop",
    template: "%s · BrightLoop",
  },
  description: "Brands. Systems. Growth.",
  // Sprint 0: nothing here is real, public-facing content yet. Indexing is
  // enabled deliberately in the public-surface sprint, per handoff §10.4.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Dark-first: Midnight Navy is the primary canvas. The light theme is opt-in
  // via [data-theme="light"] (see tokens/colors.css).
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
