import type { Metadata } from "next";
import { ComingSoon } from "../ComingSoon";

export const metadata: Metadata = { title: "Settings · Auxion" };

export default function SettingsPage() {
  return (
    <ComingSoon
      title="Settings"
      icon="settings"
      description="Configure your Auxion workspace, team and preferences."
    />
  );
}
