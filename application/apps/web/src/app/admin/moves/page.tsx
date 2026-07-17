import type { Metadata } from "next";
import { ComingSoon } from "../ComingSoon";

export const metadata: Metadata = { title: "Moves · Auxion" };

export default function MovesPage() {
  return (
    <ComingSoon
      title="Moves"
      icon="git-branch"
      description="The unit of transformation: plan, execute and measure a change end to end."
    />
  );
}
