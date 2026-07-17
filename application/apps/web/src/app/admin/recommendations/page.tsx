import type { Metadata } from "next";
import { ComingSoon } from "../ComingSoon";

export const metadata: Metadata = { title: "Recommendations · Auxion" };

export default function RecommendationsPage() {
  return (
    <ComingSoon
      title="Recommendations"
      icon="sparkles"
      description="Proposed moves — human or AI-assisted — each with rationale and expected outcome."
    />
  );
}
