import type { Metadata } from "next";
import { ComingSoon } from "../ComingSoon";

export const metadata: Metadata = { title: "Knowledge · Auxion" };

export default function KnowledgePage() {
  return (
    <ComingSoon
      title="Knowledge"
      icon="book-open"
      description="Reusable playbooks, lessons and policies captured from the transformation work."
    />
  );
}
