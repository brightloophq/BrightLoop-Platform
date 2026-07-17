import type { Metadata } from "next";
import { ComingSoon } from "../ComingSoon";

export const metadata: Metadata = { title: "Measurements · Auxion" };

export default function MeasurementsPage() {
  return (
    <ComingSoon
      title="Measurements"
      icon="line-chart"
      description="Did the move work? Targets versus observed outcomes, and the learnings they produce."
    />
  );
}
