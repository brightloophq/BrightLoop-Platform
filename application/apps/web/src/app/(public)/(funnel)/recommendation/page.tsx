import type { Metadata } from "next";
import { FunnelWizard } from "../FunnelWizard";
import { funnelCatalog } from "../catalog-data";

export const metadata: Metadata = { title: "Recommendation" };

export default function RecommendationPage() {
  return <FunnelWizard step="recommendation" catalog={funnelCatalog()} />;
}
