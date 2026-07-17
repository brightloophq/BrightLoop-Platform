import type { Metadata } from "next";
import { ComingSoon } from "../ComingSoon";

export const metadata: Metadata = { title: "Approvals · Auxion" };

export default function ApprovalsPage() {
  return (
    <ComingSoon
      title="Approvals"
      icon="check-circle"
      description="The human-authorization gate: no consequential move executes without a granted approval."
    />
  );
}
