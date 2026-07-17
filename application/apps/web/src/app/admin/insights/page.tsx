import type { Metadata } from "next";
import { ComingSoon } from "../ComingSoon";

export const metadata: Metadata = { title: "Insights · Auxion" };

export default function InsightsPage() {
  return (
    <ComingSoon
      title="Insights"
      icon="lightbulb"
      description="What the signals mean: analysis that turns raw signals into understanding."
    />
  );
}
