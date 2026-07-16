import type { Metadata } from "next";
import { FunnelWizard } from "../FunnelWizard";
import { funnelCatalog } from "../catalog-data";

export const metadata: Metadata = { title: "Assessment" };

export default function AssessmentPage() {
  return <FunnelWizard step="assessment" catalog={funnelCatalog()} />;
}
