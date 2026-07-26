/* =============================================================================
 * In-memory Transformation Execution repositories (Phase D) — TEST SUPPORT.
 *
 * A complete in-memory implementation of the eleven Phase D ports for unit +
 * integration tests. Optimistic concurrency, append-only activity/assignment/
 * progress, and idempotent activity append are all faithfully modelled. No io.
 * ========================================================================== */

import { ok, type RuntimeResult, type TransformationExecutionRepositories } from "@brightloop/domain";
import type { Assignment, Dependency, Initiative, Kpi, ProgressSnapshot, Review, Task, Timeline, TransformationActivity, TransformationWorkspace, TxMilestone } from "@brightloop/schema";

const conflict = (): RuntimeResult<never> => ({ ok: false, code: "conflict", message: "version mismatch", detail: null });

/** Build a fresh set of in-memory Phase D repositories. */
export function createInMemoryExecutionRepos(): TransformationExecutionRepositories {
  const workspaces = new Map<string, TransformationWorkspace>();
  const initiatives = new Map<string, Initiative>();
  const activities = new Map<string, TransformationActivity>(); // keyed by commandId
  const reviews = new Map<string, Review>();
  const tasks = new Map<string, Task>();
  const assignments: Assignment[] = [];
  const dependencies = new Map<string, Dependency>();
  const timelines = new Map<string, Timeline>();
  const milestones = new Map<string, TxMilestone>();
  const kpis = new Map<string, Kpi>();
  const snapshots: ProgressSnapshot[] = [];

  return {
    workspaces: {
      create: async (w) => { workspaces.set(w.id, w); return ok("created", w); },
      getById: async (id) => ok("found", workspaces.get(id) ?? null),
      getBySeed: async (s, c) => ok("found", [...workspaces.values()].find((w) => w.scanRunId === s && w.seedChecksum === c) ?? null),
      listByClient: async () => ok("found", [...workspaces.values()]),
    },
    initiatives: {
      createMany: async (items) => { for (const i of items) initiatives.set(i.id, i); return ok("created", [...items]); },
      listByWorkspace: async (wid) => ok("found", [...initiatives.values()].filter((i) => i.workspaceId === wid)),
      getById: async (id) => ok("found", initiatives.get(id) ?? null),
      save: async (next, expected) => { const cur = initiatives.get(next.id); if (!cur || cur.version !== expected) return conflict(); initiatives.set(next.id, next); return ok("updated", next); },
    },
    activities: {
      append: async (a) => { const had = activities.has(a.commandId); if (!had) activities.set(a.commandId, a); return ok(had ? "replayed" : "created", activities.get(a.commandId)!); },
      listByWorkspace: async (wid) => ok("found", [...activities.values()].filter((a) => a.workspaceId === wid)),
    },
    reviews: {
      create: async (r) => { reviews.set(r.id, r); return ok("created", r); },
      getById: async (id) => ok("found", reviews.get(id) ?? null),
      listByInitiative: async (iid) => ok("found", [...reviews.values()].filter((r) => r.initiativeId === iid)),
      listByWorkspace: async (wid) => ok("found", [...reviews.values()].filter((r) => r.workspaceId === wid)),
      save: async (next, expected) => { const cur = reviews.get(next.id); if (!cur || cur.version !== expected) return conflict(); reviews.set(next.id, next); return ok("updated", next); },
    },
    tasks: {
      create: async (t) => { tasks.set(t.id, t); return ok("created", t); },
      getById: async (id) => ok("found", tasks.get(id) ?? null),
      listByInitiative: async (iid) => ok("found", [...tasks.values()].filter((t) => t.initiativeId === iid)),
      listByWorkspace: async (wid) => ok("found", [...tasks.values()].filter((t) => t.workspaceId === wid)),
      save: async (next, expected) => { const cur = tasks.get(next.id); if (!cur || cur.version !== expected) return conflict(); tasks.set(next.id, next); return ok("updated", next); },
    },
    assignments: {
      append: async (a) => { assignments.push(a); return ok("created", a); },
      listByTask: async (tid) => ok("found", assignments.filter((a) => a.taskId === tid)),
    },
    dependencies: {
      create: async (d) => { dependencies.set(d.id, d); return ok("created", d); },
      remove: async (id) => { dependencies.delete(id); return ok("updated", null); },
      getById: async (id) => ok("found", dependencies.get(id) ?? null),
      listByWorkspace: async (wid) => ok("found", [...dependencies.values()].filter((d) => d.workspaceId === wid)),
    },
    timelines: {
      create: async (t) => { timelines.set(t.id, t); return ok("created", t); },
      getById: async (id) => ok("found", timelines.get(id) ?? null),
      getByInitiative: async (iid) => ok("found", [...timelines.values()].find((t) => t.initiativeId === iid) ?? null),
      listByWorkspace: async (wid) => ok("found", [...timelines.values()].filter((t) => t.workspaceId === wid)),
      save: async (next, expected) => { const cur = timelines.get(next.id); if (!cur || cur.version !== expected) return conflict(); timelines.set(next.id, next); return ok("updated", next); },
    },
    milestones: {
      create: async (m) => { milestones.set(m.id, m); return ok("created", m); },
      getById: async (id) => ok("found", milestones.get(id) ?? null),
      listByInitiative: async (iid) => ok("found", [...milestones.values()].filter((m) => m.initiativeId === iid)),
      listByWorkspace: async (wid) => ok("found", [...milestones.values()].filter((m) => m.workspaceId === wid)),
      save: async (next, expected) => { const cur = milestones.get(next.id); if (!cur || cur.version !== expected) return conflict(); milestones.set(next.id, next); return ok("updated", next); },
    },
    kpis: {
      create: async (k) => { kpis.set(k.id, k); return ok("created", k); },
      getById: async (id) => ok("found", kpis.get(id) ?? null),
      listByWorkspace: async (wid) => ok("found", [...kpis.values()].filter((k) => k.workspaceId === wid)),
      save: async (next, expected) => { const cur = kpis.get(next.id); if (!cur || cur.version !== expected) return conflict(); kpis.set(next.id, next); return ok("updated", next); },
    },
    progress: {
      append: async (s) => { snapshots.push(s); return ok("created", s); },
      listByWorkspace: async (wid) => ok("found", snapshots.filter((s) => s.workspaceId === wid)),
      listBySubject: async (sid) => ok("found", snapshots.filter((s) => s.subjectId === sid)),
    },
  };
}
