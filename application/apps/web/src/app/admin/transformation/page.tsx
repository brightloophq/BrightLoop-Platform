import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, Button, EmptyWorkspace, OperationalPanel, SectionHeader, SectionRule } from "@brightloop/ui";
import { requireSurface } from "@/lib/auth";
import { loadTransformationWorkspaceList } from "@/lib/transformation-workspace-data";
import { seedTransformationFormAction } from "./transformation-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Transformations · Auxion" };

/**
 * Transformation Execution — workspace index (Phase D · Sprint D1).
 *
 * Read-only list of seeded workspaces, plus the ONE write path: seed a workspace
 * from a certified scan run id. Seeding is idempotent, so re-seeding lands on the
 * same workspace.
 */
export default async function TransformationIndexPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSurface("admin");
  const sp = await searchParams;
  const error = typeof sp["error"] === "string" ? sp["error"] : null;
  const workspaces = (await loadTransformationWorkspaceList()) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", padding: "var(--space-4)" }}>
      <SectionHeader
        as="h1"
        size="page"
        index="01"
        title="Transformations"
        hint="Execution workspaces seeded deterministically from certified proposals."
      />

      {error ? <Alert tone="danger" title="That didn't complete">{error}</Alert> : null}

      <OperationalPanel tone="anchor">
        <SectionRule index="01" label="Seed a workspace" meta="from a certified scan" />
        <form action={seedTransformationFormAction} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", marginTop: "var(--space-3)" }}>
          <input
            type="text"
            name="scanRunId"
            placeholder="Certified scan run id"
            aria-label="Certified scan run id"
            style={{ flex: "1 1 320px", padding: "var(--space-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)", background: "var(--surface)", color: "var(--ink)" }}
          />
          <Button type="submit" variant="primary">Seed workspace</Button>
        </form>
        <p style={{ opacity: 0.7, fontSize: "0.85rem", marginTop: "var(--space-2)" }}>
          Seeds initiatives from the scan&apos;s proposal. Deterministic and idempotent — no AI credit is spent, and re-seeding returns the same workspace.
        </p>
      </OperationalPanel>

      <OperationalPanel>
        <SectionRule index="02" label="Workspaces" meta={`${workspaces.length}`} />
        {workspaces.length === 0 ? (
          <EmptyWorkspace title="No transformations yet" body="Seed one from a certified scan above." />
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0 0", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {workspaces.map((w) => (
              <li key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <Link href={`/admin/transformation/${w.id}`}><strong>{w.title}</strong></Link>
                  <span style={{ opacity: 0.6, fontSize: "0.75rem" }}>scan {w.scanRunId}</span>
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                  <Badge status="idle">{w.initiativeCount} initiatives</Badge>
                  <Badge status="active">{w.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </OperationalPanel>
    </div>
  );
}
