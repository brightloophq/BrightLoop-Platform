import type { Metadata } from "next";
import Link from "next/link";
import { AuthorizationError, assertDashboardRead } from "@brightloop/domain";
import { Button, EmptyState, SectionHeader, SystemMapExplorer } from "@brightloop/ui";
import { requireSurface } from "@/lib/auth";
import { getSystemMapData } from "@/lib/system-map-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "System Map · Auxion" };

/**
 * The interactive Transformation System Map (PX.1d) — Auxion's signature screen.
 * Reuses the transformation read authorization + the System Map layout, and the
 * demo/live data seam. Reachable from the Console's System Map panel; adds no nav
 * item and changes no existing surface.
 */
export default async function SystemMapPage() {
  const actor = await requireSurface("admin");
  try {
    assertDashboardRead(actor);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <div style={{ padding: "var(--gutter)" }}>
          <EmptyState icon="lock" title="Not authorized" body="Your role can't view the transformation System Map." />
        </div>
      );
    }
    throw err;
  }

  const data = await getSystemMapData();

  return (
    <div style={{ padding: "var(--gutter)", display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <SectionHeader
        as="h1"
        size="page"
        index="01"
        kicker="System state"
        title="Transformation System Map"
        hint="Every domain, its health and risk, and how your business systems connect — hover a node for a summary, click for the full picture, or search and filter to focus."
        action={
          <Button asChild variant="ghost">
            <Link href="/admin/dashboard">Back to Console</Link>
          </Button>
        }
      />
      {data ? (
        <SystemMapExplorer data={data} />
      ) : (
        <EmptyState
          icon="route"
          title="Your System Map is still assembling"
          body="Run a Business Scan to bring your seven domains online. Once domains have activity, this map comes alive — hover, click, search and filter across your whole operating system."
        />
      )}
    </div>
  );
}
