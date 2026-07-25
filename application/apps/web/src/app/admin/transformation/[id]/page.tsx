import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Button, OperationalPanel, SectionHeader, SectionRule } from "@brightloop/ui";
import { requireSurface } from "@/lib/auth";
import { loadTransformationWorkspace } from "@/lib/transformation-workspace-data";
import { transitionInitiativeFormAction } from "../transformation-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Transformation workspace · Auxion" };

/** The single legal next lifecycle action for a given initiative status (D2). */
const NEXT_ACTION: Record<string, { action: string; label: string } | null> = {
  seeded: { action: "plan", label: "Plan" },
  planned: { action: "activate", label: "Activate" },
  active: { action: "complete", label: "Complete" },
  completed: { action: "archive", label: "Archive" },
  archived: null,
};

/**
 * Transformation Workspace — overview + initiative lifecycle (Phase D · D1/D2).
 *
 * Server-rendered from Phase D read models. D2 adds the single legal lifecycle
 * action per initiative (Plan → Activate → Complete → Archive) via server actions.
 * No Kanban, drag-and-drop, tasks, or timeline — those are later sprints.
 */
export default async function TransformationWorkspacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSurface("admin");
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp["error"] === "string" ? sp["error"] : null;
  const data = await loadTransformationWorkspace(id);
  if (data === null) notFound();

  const { workspace, initiatives, progress, activities } = data;
  const facts: { key: string; value: string }[] = [
    { key: "Status", value: workspace.status },
    { key: "Source scan", value: workspace.scanRunId },
    { key: "Initiatives", value: String(workspace.initiativeCount) },
    { key: "Seed checksum", value: workspace.seedChecksum },
    { key: "Created", value: workspace.createdAt },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", padding: "var(--space-4)" }}>
      <SectionHeader
        as="h1"
        size="page"
        index="01"
        kicker={<Link href="/admin/transformation">← Transformations</Link>}
        title={workspace.title}
        hint="A deterministic execution workspace seeded from a certified proposal. Advance each initiative one lifecycle step at a time."
      />

      {error ? <Alert tone="danger" title="That didn't complete">{error}</Alert> : null}

      <OperationalPanel tone="anchor">
        <SectionRule index="01" label="Workspace summary" meta="deterministic · evidence-traced" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          {facts.map((f) => (
            <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>{f.key}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", wordBreak: "break-word" }}>{f.value}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
          <Badge status="active">{progress.byPriority.critical} critical</Badge>
          <Badge status="pending">{progress.byPriority.high} high</Badge>
          <Badge status="idle">{progress.byPriority.medium} medium</Badge>
          <Badge status="idle">{progress.byPriority.low} low</Badge>
        </div>
      </OperationalPanel>

      <OperationalPanel>
        <SectionRule index="02" label="Initiatives" meta={`${initiatives.length} seeded`} />
        {initiatives.length === 0 ? (
          <p style={{ opacity: 0.7, marginTop: "var(--space-3)" }}>No initiatives — the source proposal had no evidence-backed items.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0 0", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {initiatives.map((i) => {
              const next = NEXT_ACTION[i.executionStatus] ?? null;
              return (
                <li key={i.id} style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "var(--space-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)" }}>
                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{i.title}</strong>
                    <Badge status="pending">{i.priority}</Badge>
                    <Badge status="idle">{i.effort}</Badge>
                    <Badge status="active">{i.executionStatus}</Badge>
                    <span style={{ marginLeft: "auto" }}>
                      {next ? (
                        <form action={transitionInitiativeFormAction} style={{ display: "inline" }}>
                          <input type="hidden" name="initiativeId" value={i.id} />
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <input type="hidden" name="action" value={next.action} />
                          <Button type="submit" variant="secondary">{next.label}</Button>
                        </form>
                      ) : (
                        <Badge status="idle">terminal</Badge>
                      )}
                    </span>
                  </div>
                  {i.objective ? <span style={{ opacity: 0.8, fontSize: "0.9rem" }}>{i.objective}</span> : null}
                  <span style={{ opacity: 0.6, fontSize: "0.75rem" }}>
                    v{i.version} · {i.supportingEvidenceIds.length} evidence · {i.dependencies.length} dependency(ies)
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </OperationalPanel>

      <OperationalPanel>
        <SectionRule index="03" label="Activity" meta="append-only audit" />
        <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0 0", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          {activities.map((a) => (
            <li key={a.id} style={{ display: "flex", gap: "var(--space-2)", fontSize: "0.85rem" }}>
              <Badge status="idle">{a.type}</Badge>
              <span style={{ opacity: 0.8 }}>{a.summary}</span>
            </li>
          ))}
        </ul>
      </OperationalPanel>
    </div>
  );
}
