import type { Metadata } from "next";
import { ComingSoon } from "../ComingSoon";

export const metadata: Metadata = { title: "Signals · Auxion" };

export default function SignalsPage() {
  return (
    <ComingSoon
      title="Signals"
      icon="activity"
      description="Detected conditions worth attention — the entry point of the transformation cycle."
    />
  );
}
