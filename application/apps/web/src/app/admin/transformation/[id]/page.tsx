import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Button, OperationalPanel, SectionHeader, SectionRule } from "@brightloop/ui";
import { requireSurface } from "@/lib/auth";
import { loadTransformationWorkspaceExecution } from "@/lib/transformation-workspace-data";
import {
  dependencyLinkFormAction,
  dependencyUnlinkFormAction,
  inboxFormAction,
  kpiCreateFormAction,
  kpiUpdateFormAction,
  milestoneCreateFormAction,
  milestoneTransitionFormAction,
  noteFormAction,
  progressCalculateFormAction,
  reviewFormAction,
  subscribeFormAction,
  taskAssignFormAction,
  taskCreateFormAction,
  taskTransitionFormAction,
  timelineCreateFormAction,
  timelineTransitionFormAction,
  transitionInitiativeFormAction,
  unsubscribeFormAction,
  workspaceHealthFormAction,
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
/** The single legal next timeline action per status (D5). */
const TIMELINE_NEXT: Record<string, { action: string; label: string } | null> = {
  planned: { action: "start", label: "Start" },
  active: { action: "complete", label: "Complete" },
  completed: null,
  cancelled: null,
};
/** Health / KPI status → Badge tone. */
const HEALTH_TONE: Record<string, "active" | "pending" | "idle"> = { healthy: "active", on_track: "active", warning: "pending", at_risk: "pending", critical: "idle", off_track: "idle" };
const healthTone = (s: string | null): "active" | "pending" | "idle" => (s ? HEALTH_TONE[s] ?? "idle" : "idle");

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

  const { detail, execution, performance, feed, inbox, subscriptions } = data;
  const { workspace, initiatives } = detail;
  const subscribedTargetIds = new Set(subscriptions.subscriptions.map((s) => s.targetId));
  const readySet = new Set(execution.executionReadyInitiativeIds);
  const wsField = hidden("workspaceId", workspace.id);
  const initiativeTitle = (iid: string) => initiatives.find((i) => i.id === iid)?.title ?? iid;
  const timelineOf = (iid: string) => performance.timelines.find((t) => t.initiativeId === iid) ?? null;
  const milestonesOf = (iid: string) => performance.milestones.filter((m) => m.initiativeId === iid);
  const progressOf = (iid: string) => performance.initiativeProgress.find((p) => p.initiativeId === iid)?.progress ?? null;
  const inputStyle = { padding: "2px 6px", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--ink)", fontSize: "0.75rem" } as const;

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
          <Badge status={inbox.unread > 0 ? "active" : "idle"}>inbox: {inbox.unread} unread</Badge>
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

            {(() => {
              const timeline = timelineOf(i.id);
              const milestones = milestonesOf(i.id);
              const progress = progressOf(i.id);
              const tn = timeline ? TIMELINE_NEXT[timeline.status] ?? null : null;
              return (
                <div style={{ marginTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>Timeline</span>
                    {timeline ? (
                      <>
                        <Badge status={timeline.status === "completed" ? "active" : timeline.status === "cancelled" ? "idle" : "pending"}>{timeline.status}</Badge>
                        <span style={{ fontSize: "0.8rem" }}>{timeline.startDate} → {timeline.targetEndDate}{timeline.actualEndDate ? ` (ended ${timeline.actualEndDate.slice(0, 10)})` : ""}</span>
                        {timeline.variance !== null ? <Badge status={timeline.variance > 0 ? "idle" : "active"}>{timeline.variance > 0 ? `+${timeline.variance}d late` : `${timeline.variance}d`}</Badge> : null}
                        {tn ? (
                          <form action={timelineTransitionFormAction} style={{ display: "inline" }}>
                            {wsField}{hidden("timelineId", timeline.id)}{hidden("action", tn.action)}
                            <Button type="submit" variant="ghost">{tn.label}</Button>
                          </form>
                        ) : null}
                        {timeline.status === "planned" || timeline.status === "active" ? (
                          <form action={timelineTransitionFormAction} style={{ display: "inline" }}>
                            {wsField}{hidden("timelineId", timeline.id)}{hidden("action", "cancel")}
                            <Button type="submit" variant="ghost">Cancel</Button>
                          </form>
                        ) : null}
                      </>
                    ) : (
                      <form action={timelineCreateFormAction} style={{ display: "flex", gap: "var(--space-1)", alignItems: "center", flexWrap: "wrap" }}>
                        {wsField}{hidden("initiativeId", i.id)}
                        <input type="date" name="startDate" aria-label="start date" style={inputStyle} />
                        <input type="date" name="targetEndDate" aria-label="target end date" style={inputStyle} />
                        <Button type="submit" variant="ghost">Add timeline</Button>
                      </form>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>Milestones ({milestones.length})</span>
                    {milestones.map((mst) => (
                      <span key={mst.id} style={{ display: "inline-flex", gap: "var(--space-1)", alignItems: "center", fontSize: "0.8rem" }}>
                        <Badge status={mst.status === "completed" ? "active" : mst.status === "missed" ? "idle" : "pending"}>{mst.title}</Badge>
                        {mst.status === "pending" ? (
                          (["complete", "miss"] as const).map((act) => (
                            <form key={act} action={milestoneTransitionFormAction} style={{ display: "inline" }}>
                              {wsField}{hidden("milestoneId", mst.id)}{hidden("action", act)}
                              <Button type="submit" variant="ghost">{act}</Button>
                            </form>
                          ))
                        ) : null}
                      </span>
                    ))}
                    <form action={milestoneCreateFormAction} style={{ display: "flex", gap: "var(--space-1)", alignItems: "center", flexWrap: "wrap" }}>
                      {wsField}{hidden("initiativeId", i.id)}
                      <input type="text" name="title" placeholder="milestone" aria-label="milestone title" style={inputStyle} />
                      <input type="date" name="plannedDate" aria-label="planned date" style={inputStyle} />
                      <Button type="submit" variant="ghost">Add</Button>
                    </form>
                  </div>

                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>Progress</span>
                    <Badge status={progress !== null && progress >= 100 ? "active" : "pending"}>{progress === null ? "not calculated" : `${progress}%`}</Badge>
                    <form action={progressCalculateFormAction} style={{ display: "inline" }}>
                      {wsField}{hidden("initiativeId", i.id)}
                      <Button type="submit" variant="ghost">Recalculate</Button>
                    </form>
                  </div>
                </div>
              );
            })()}

            {(() => {
              const sub = subscriptions.subscriptions.find((s) => s.targetType === "initiative" && s.targetId === i.id) ?? null;
              return (
                <div style={{ marginTop: "var(--space-3)", display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: "var(--space-3)" }}>
                  {sub ? (
                    <form action={unsubscribeFormAction} style={{ display: "inline" }}>
                      {wsField}{hidden("subscriptionId", sub.id)}
                      <Button type="submit" variant="ghost">Unwatch</Button>
                    </form>
                  ) : (
                    <form action={subscribeFormAction} style={{ display: "inline" }}>
                      {wsField}{hidden("targetType", "initiative")}{hidden("targetId", i.id)}
                      <Button type="submit" variant="ghost">Watch</Button>
                    </form>
                  )}
                  <form action={noteFormAction} style={{ display: "flex", gap: "var(--space-1)", alignItems: "center", flexWrap: "wrap", flex: 1 }}>
                    {wsField}{hidden("subjectType", "initiative")}{hidden("subjectId", i.id)}
                    <input type="text" name="text" placeholder="Add a note…" aria-label="note" style={{ flex: "1 1 200px", padding: "2px 6px", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--ink)", fontSize: "0.8rem" }} />
                    <input type="text" name="mentions" placeholder="@mention user ids" aria-label="mentions" style={inputStyle} />
                    <Button type="submit" variant="ghost">Note</Button>
                  </form>
                </div>
              );
            })()}
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

      <OperationalPanel tone="anchor">
        <SectionRule index="04" label="Workspace performance" meta={performance.health ? `health: ${performance.health}` : "not calculated"} />
        <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
          <Badge status={healthTone(performance.health)}>{performance.health ? `health: ${performance.health}` : "health: —"}</Badge>
          <Badge status="idle">{performance.workspaceProgress}% overall</Badge>
          <form action={workspaceHealthFormAction} style={{ display: "inline" }}>
            {wsField}
            <Button type="submit" variant="secondary">Recalculate health</Button>
          </form>
        </div>
      </OperationalPanel>

      <OperationalPanel>
        <SectionRule index="05" label="KPIs" meta={`${performance.kpis.length}`} />
        <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0 0", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {performance.kpis.map((kpi) => (
            <li key={kpi.id} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", fontSize: "0.85rem" }}>
              <strong>{kpi.name}</strong>
              <Badge status={healthTone(kpi.status)}>{kpi.status.replace("_", " ")}</Badge>
              <span style={{ opacity: 0.8 }}>{kpi.current} / {kpi.target}{kpi.unit ? ` ${kpi.unit}` : ""}</span>
              <form action={kpiUpdateFormAction} style={{ display: "inline", marginLeft: "auto" }}>
                {wsField}{hidden("kpiId", kpi.id)}
                <input type="number" name="current" step="any" placeholder="new value" aria-label="new KPI value" style={inputStyle} />
                <Button type="submit" variant="ghost">Update</Button>
              </form>
            </li>
          ))}
        </ul>
        <form action={kpiCreateFormAction} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
          {wsField}
          <input type="text" name="name" placeholder="KPI name" aria-label="KPI name" style={{ flex: "1 1 160px", padding: "var(--space-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)", background: "var(--surface)", color: "var(--ink)" }} />
          <input type="number" name="target" step="any" placeholder="target" aria-label="target" style={{ width: "6rem", padding: "var(--space-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)", background: "var(--surface)", color: "var(--ink)" }} />
          <input type="number" name="current" step="any" placeholder="current" aria-label="current" style={{ width: "6rem", padding: "var(--space-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)", background: "var(--surface)", color: "var(--ink)" }} />
          <input type="text" name="unit" placeholder="unit" aria-label="unit" style={{ width: "6rem", padding: "var(--space-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)", background: "var(--surface)", color: "var(--ink)" }} />
          <Button type="submit" variant="secondary">Add KPI</Button>
        </form>
      </OperationalPanel>

      <OperationalPanel tone="anchor">
        <SectionRule index="06" label="Inbox" meta={`${inbox.unread} unread · ${inbox.total} total`} />
        <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0 0", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {inbox.items.filter((it) => it.status !== "dismissed").length === 0 ? (
            <li style={{ fontSize: "0.85rem", opacity: 0.7 }}>Nothing in your inbox.</li>
          ) : inbox.items.filter((it) => it.status !== "dismissed").map((it) => (
            <li key={it.id} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", padding: "var(--space-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)", fontSize: "0.85rem" }}>
              <Badge status={it.status === "unread" ? "active" : "idle"}>{it.status}</Badge>
              <Badge status="idle">{it.notification?.type ?? "—"}</Badge>
              <span style={{ opacity: 0.85 }}>{renderMentions(it.notification?.summary ?? "")}</span>
              <span style={{ marginLeft: "auto", display: "inline-flex", gap: "var(--space-1)" }}>
                {/* archived is terminal, so it offers no further transitions */}
                {(it.status === "unread" ? ["read", "archive", "dismiss"] : it.status === "read" ? ["unread", "archive", "dismiss"] : []).map((act) => (
                  <form key={act} action={inboxFormAction} style={{ display: "inline" }}>
                    {wsField}{hidden("inboxItemId", it.id)}{hidden("action", act)}
                    <Button type="submit" variant="ghost">{act}</Button>
                  </form>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </OperationalPanel>

      <OperationalPanel>
        <SectionRule index="07" label="Subscriptions" meta={`${subscriptions.count}`} />
        <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
          {subscriptions.subscriptions.length === 0 ? <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>Not watching anything.</span> : null}
          {subscriptions.subscriptions.map((s) => (
            <span key={s.id} style={{ display: "inline-flex", gap: "var(--space-1)", alignItems: "center", fontSize: "0.8rem" }}>
              <Badge status="idle">{s.targetType}: {s.targetType === "initiative" ? initiativeTitle(s.targetId) : s.targetId}</Badge>
              <form action={unsubscribeFormAction} style={{ display: "inline" }}>
                {wsField}{hidden("subscriptionId", s.id)}
                <Button type="submit" variant="ghost">Unwatch</Button>
              </form>
            </span>
          ))}
          <form action={subscribeFormAction} style={{ display: "inline-flex", gap: "var(--space-1)", alignItems: "center", marginLeft: "auto" }}>
            {wsField}{hidden("targetType", "workspace")}{hidden("targetId", workspace.id)}
            <Button type="submit" variant="ghost">{subscribedTargetIds.has(workspace.id) ? "Watching workspace" : "Watch workspace"}</Button>
          </form>
        </div>
      </OperationalPanel>

      <OperationalPanel>
        <SectionRule index="08" label="Activity feed" meta="append-only · newest first" />
        <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0 0", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          {feed.items.map((a) => (
            <li key={a.id} style={{ display: "flex", gap: "var(--space-2)", alignItems: "baseline", fontSize: "0.85rem", flexWrap: "wrap" }}>
              <Badge status="idle">{a.type}</Badge>
              <span style={{ opacity: 0.85 }}>{renderMentions(a.summary)}</span>
              <span style={{ marginLeft: "auto", fontSize: "0.72rem", opacity: 0.6 }}>{a.actorId ? `@${a.actorId}` : "system"} · {a.at.slice(0, 16).replace("T", " ")}</span>
            </li>
          ))}
          {feed.items.length === 0 ? <li style={{ fontSize: "0.85rem", opacity: 0.7 }}>No activity yet.</li> : null}
        </ul>
        {feed.nextCursor ? <p style={{ fontSize: "0.72rem", opacity: 0.6, marginTop: "var(--space-2)" }}>More activity beyond this page.</p> : null}
      </OperationalPanel>
    </div>
  );
}

/** Render `@handle` tokens with emphasis; everything else is plain text. */
function renderMentions(text: string): ReactNode {
  const parts = text.split(/(@[A-Za-z0-9._-]+)/g);
  return parts.map((part, idx) =>
    part.startsWith("@") ? <strong key={idx} style={{ color: "var(--accent, inherit)" }}>{part}</strong> : <span key={idx}>{part}</span>,
  );
}
