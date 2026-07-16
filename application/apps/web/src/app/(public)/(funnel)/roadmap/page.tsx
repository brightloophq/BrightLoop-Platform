import type { Metadata } from "next";
import { FunnelWizard } from "../FunnelWizard";
import { funnelCatalog } from "../catalog-data";

export const metadata: Metadata = { title: "Roadmap" };

export default function RoadmapPage() {
  return <FunnelWizard step="roadmap" catalog={funnelCatalog()} />;
}
