import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Button, OperationalPanel, SectionHeader, SectionRule } from "@brightloop/ui";
import { requireSurface } from "@/lib/auth";
import { loadTransformationWorkspaceExecution } from "@/lib/transformation-workspace-data";
import {
  dependencyLinkFormAction,
  dependencyUnlinkFormAction,
  reviewFormAction,
  taskAssignFormAction,
  taskCreateFormAction,
  taskTransitionFormAction,
  transitionInitiativeFormAction,
} from "../transformation-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Transformation workspace · Auxion" };

/** The single legal next lifecycle action per initiative status (D2). */
const NEXT_ACTION: Record<string, { action: string; label: string } | null> = {
  seeded: { action: "plan", label: "Plan" },
  planned: { action: "activate", label: "Activate" },
  active: { action: "complete", label: "Complete" },
  completed: { action: "archive", label: "Archive" },
  archived: null,
};
/** The single legal next task action per status (D4). */
const TASK_NEXT: Record<string, { action: string; label: string } | null> = {
  todo: { action: "start", label: "Start" },
  in_progress: { action: "complete", label: "Complete" },
  blocked: { action: "start", label: "Resume" },
  completed: null,
};

const hidden = (name: string, value: string) => <input key={name} type="hidden" name={name} value={value} />;

/**
 * Transformation Workspace — execution management (Phase D · D1–D4).
 *
 * Server-rendered from Phase D read models. Per initiative: lifecycle, reviews,
 * and tasks (with assignment); plus the workspace dependency graph. Simple
 * list/table controls via server actions — no Kanban, drag-and-drop, or timeline.
 */
export default async function TransformationWorkspacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSurface("admin");
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp["error"] === "string" ? sp["error"] : null;
  const data = await loadTransformationWorkspaceExecution(id);
  if (data === null) notFound();

  const { detail, execution } = data;
  const { workspace, initiatives, activities } = detail;
  const readySet = new Set(execution.executionReadyInitiativeIds);
  const wsField = hidden("workspaceId", workspace.id);
  const initiativeTitle = (iid: string) => initiatives.find((i) => i.id === iid)?.title ?? iid;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", padding: "var(--space-4)" }}>
      <SectionHeader as="h1" size="page" index="01" kicker={<Link href="/admin/transformation">← Transformations</Link>} title={workspace.title} hint="Execution workspace: advance initiatives, review, and manage tasks & dependencies." />
      {error ? <Alert tone="danger" title="That didn't complete">{error}</Alert> : null}

      <OperationalPanel tone="anchor">
        <SectionRule index="01" label="Workspace" meta={`${workspace.status} · ${workspace.initiativeCount} initiatives`} />
        <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
          <Badge status="idle">scan {workspace.scanRunId}</Badge>
          <Badge status="active">{readySet.size} execution-ready</Badge>
          <Badge status="idle">{execution.tasks.length} tasks</Badge>
          <Badge status="idle">{execution.dependencies.length} dependencies</Badge>
        </div>
      </OperationalPanel>

      {initiatives.map((i) => {
        const next = NEXT_ACTION[i.executionStatus] ?? null;
        const reviews = execution.reviews.filter((r) => r.initiativeId === i.id);
        const tasks = execution.tasks.filter((t) => t.initiativeId === i.id);
        return (
          <OperationalPanel key={i.id}>
            <SectionRule index="02" label={i.title} meta={`${i.priority} · ${i.executionStatus}${readySet.has(i.id) ? " · ready" : ""}`} />

            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", marginTop: "var(--space-3)" }}>
              <Badge status="active">{i.executionStatus}</Badge>
              {next ? (
                <form action={transitionInitiativeFormAction} style={{ display: "inline" }}>
                  {wsField}{hidden("initiativeId", i.id)}{hidden("action", next.action)}
                  <Button type="submit" variant="secondary">{next.label}</Button>
                </form>
              ) : null}
              <form action={reviewFormAction} style={{ display: "inline" }}>
                {wsField}{hidden("initiativeId", i.id)}{hidden("decision", "open")}
                <Button type="submit" variant="ghost">Request review</Button>
              </form>
            </div>

            {reviews.length > 0 ? (
              <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0 0", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                {reviews.map((r) => (
                  <li key={r.id} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", fontSize: "0.85rem" }}>
                    <Badge status={r.status === "approved" ? "active" : r.status === "rejected" ? "idle" : "pending"}>{r.status}</Badge>
                    {r.status === "pending" || r.status === "changes_requested" ? (
                      (["approve", "request_changes", "reject"] as const).map((d) => (
                        <form key={d} action={reviewFormAction} style={{ display: "inline" }}>
                          {wsField}{hidden("reviewId", r.id)}{hidden("decision", d)}
                          <Button type="submit" variant="ghost">{d.replace("_", " ")}</Button>
                        </form>
                      ))
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            <div style={{ marginTop: "var(--space-3)" }}>
              <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>Tasks ({tasks.length})</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-2) 0 0", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {tasks.map((t) => {
                  const tn = TASK_NEXT[t.status] ?? null;
                  return (
                    <li key={t.id} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", padding: "var(--space-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)" }}>
                      <strong style={{ fontSize: "0.9rem" }}>{t.title}</strong>
                      <Badge status="idle">{t.priority}</Badge>
                      <Badge status={t.status === "completed" ? "active" : t.status === "blocked" ? "idle" : "pending"}>{t.status}</Badge>
                      <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>{t.assigneeActorId ? `@${t.assigneeActorId}` : "unassigned"}</span>
                      {tn ? (
                        <form action={taskTransitionFormAction} style={{ display: "inline" }}>
                          {wsField}{hidden("taskId", t.id)}{hidden("action", tn.action)}
                          <Button type="submit" variant="ghost">{tn.label}</Button>
                        </form>
                      ) : null}
                      {t.status === "in_progress" ? (
                        <form action={taskTransitionFormAction} style={{ display: "inline" }}>
                          {wsField}{hidden("taskId", t.id)}{hidden("action", "block")}
                          <Button type="submit" variant="ghost">Block</Button>
                        </form>
                      ) : null}
                      {t.status !== "completed" ? (
                        <form action={taskAssignFormAction} style={{ display: "inline", marginLeft: "auto" }}>
                          {wsField}{hidden("taskId", t.id)}
                          <input type="text" name="assignee" placeholder="assignee (blank = unassign)" aria-label="assignee" style={{ padding: "2px 6px", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--ink)", fontSize: "0.75rem" }} />
                          <Button type="submit" variant="ghost">Set owner</Button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <form action={taskCreateFormAction} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginTop: "var(--space-2)", flexWrap: "wrap" }}>
                {wsField}{hidden("initiativeId", i.id)}
                <input type="text" name="title" placeholder="New task title" aria-label="task title" style={{ flex: "1 1 240px", padding: "var(--space-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)", background: "var(--surface)", color: "var(--ink)" }} />
                <select name="priority" aria-label="priority" defaultValue="medium" style={{ padding: "var(--space-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)", background: "var(--surface)", color: "var(--ink)" }}>
                  <option value="low">low</option><option value="medium">medium</option><option value="high">high</option>
                </select>
                <Button type="submit" variant="secondary">Add task</Button>
              </form>
            </div>
          </OperationalPanel>
        );
      })}

      <OperationalPanel>
        <SectionRule index="03" label="Dependencies" meta={`${execution.dependencies.length}`} />
        <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0 0", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          {execution.dependencies.map((d) => (
            <li key={d.id} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontSize: "0.85rem" }}>
              <Badge status="idle">{d.type}</Badge>
              <span>{initiativeTitle(d.fromInitiativeId)} → {initiativeTitle(d.toInitiativeId)}</span>
              <form action={dependencyUnlinkFormAction} style={{ display: "inline" }}>
                {wsField}{hidden("dependencyId", d.id)}
                <Button type="submit" variant="ghost">Remove</Button>
              </form>
            </li>
          ))}
        </ul>
        <form action={dependencyLinkFormAction} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
          {wsField}
          <select name="from" aria-label="from initiative" style={{ padding: "var(--space-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)", background: "var(--surface)", color: "var(--ink)" }}>
            {initiatives.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
          </select>
          <select name="type" aria-label="type" defaultValue="depends_on" style={{ padding: "var(--space-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)", background: "var(--surface)", color: "var(--ink)" }}>
            <option value="depends_on">depends on</option><option value="blocks">blocks</option>
          </select>
          <select name="to" aria-label="to initiative" style={{ padding: "var(--space-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)", background: "var(--surface)", color: "var(--ink)" }}>
            {initiatives.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
          </select>
          <Button type="submit" variant="secondary">Link</Button>
        </form>
      </OperationalPanel>

      <OperationalPanel>
        <SectionRule index="04" label="Activity" meta="append-only audit" />
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
