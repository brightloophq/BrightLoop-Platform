import type { Metadata } from "next";
import { FunnelWizard } from "../FunnelWizard";
import { funnelCatalog } from "../catalog-data";

/**
 * Not indexable: this step renders the wizard's own state, so a crawler
 * arriving cold would index an empty reset of it rather than a page.
 * /assessment and /configurator ARE indexable — they are real entry points.
 */
export const metadata: Metadata = {
  title: "Roadmap",
  robots: { index: false, follow: false },
};

export default function RoadmapPage() {
  return <FunnelWizard step="roadmap" catalog={funnelCatalog()} />;
}
