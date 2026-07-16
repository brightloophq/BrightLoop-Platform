import type { Metadata } from "next";
import { FunnelWizard } from "../FunnelWizard";
import { funnelCatalog } from "../catalog-data";

export const metadata: Metadata = { title: "Configurator" };

export default function ConfiguratorPage() {
  return <FunnelWizard step="configurator" catalog={funnelCatalog()} />;
}
