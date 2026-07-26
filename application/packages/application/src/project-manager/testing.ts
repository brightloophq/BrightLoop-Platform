/* =============================================================================
 * In-memory AI Project Manager repositories (Phase E · Sprint E4) — TEST SUPPORT.
 *
 * The planning session is versioned (optimistic concurrency); the execution plan +
 * all plan records + feedback are append-only. E1/E2/E3 + Phase D doubles come
 * from their own testing modules — the PM reaches them only via app services.
 * ========================================================================== */

import { ok, type ProjectManagerRepositories, type RuntimeResult } from "@brightloop/domain";
import type {
  DependencyPlan, ExecutionPlan, ExecutionRisk, InitiativePlan, KpiPlan, MilestonePlan, PlanningFeedback,
  PlanningSession, ResourceEstimate, ReviewPlan, TaskPlan, TimelinePlan,
} from "@brightloop/schema";

const conflict = (): RuntimeResult<never> => ({ ok: false, code: "conflict", message: "version mismatch", detail: null });

export function createInMemoryProjectManagerRepos(): ProjectManagerRepositories {
  const sessions = new Map<string, PlanningSession>();
  const plans = new Map<string, ExecutionPlan>(); // keyed by planningSessionId
  const initiatives: InitiativePlan[] = [];
  const milestones: MilestonePlan[] = [];
  const tasks: TaskPlan[] = [];
  const dependencies: DependencyPlan[] = [];
  const timelines: TimelinePlan[] = [];
  const reviews = new Map<string, ReviewPlan>();
  const kpis: KpiPlan[] = [];
  const resources: ResourceEstimate[] = [];
  const risks: ExecutionRisk[] = [];
  const feedback: PlanningFeedback[] = [];

  return {
    sessions: {
      create: async (s) => { sessions.set(s.id, s); return ok("created", s); },
      getById: async (id) => ok("found", sessions.get(id) ?? null),
      listByWorkspace: async (wid) => ok("found", [...sessions.values()].filter((s) => s.workspaceId === wid)),
      save: async (next, expected) => { const cur = sessions.get(next.id); if (!cur || cur.version !== expected) return conflict(); sessions.set(next.id, next); return ok("updated", next); },
    },
    plans: {
      append: async (p) => { plans.set(p.planningSessionId, p); return ok("created", p); },
      getBySession: async (sid) => ok("found", plans.get(sid) ?? null),
      save: async (next) => { plans.set(next.planningSessionId, next); return ok("updated", next); },
    },
    initiatives: { appendMany: async (r) => { initiatives.push(...r); return ok("created", [...r]); }, listBySession: async (sid) => ok("found", initiatives.filter((x) => x.planningSessionId === sid)) },
    milestones: { appendMany: async (r) => { milestones.push(...r); return ok("created", [...r]); }, listBySession: async (sid) => ok("found", milestones.filter((x) => x.planningSessionId === sid)) },
    tasks: { appendMany: async (r) => { tasks.push(...r); return ok("created", [...r]); }, listBySession: async (sid) => ok("found", tasks.filter((x) => x.planningSessionId === sid)) },
    dependencies: { appendMany: async (r) => { dependencies.push(...r); return ok("created", [...r]); }, listBySession: async (sid) => ok("found", dependencies.filter((x) => x.planningSessionId === sid)) },
    timelines: { appendMany: async (r) => { timelines.push(...r); return ok("created", [...r]); }, listBySession: async (sid) => ok("found", timelines.filter((x) => x.planningSessionId === sid)) },
    reviews: { append: async (r) => { reviews.set(r.planningSessionId, r); return ok("created", r); }, getBySession: async (sid) => ok("found", reviews.get(sid) ?? null) },
    kpis: { appendMany: async (r) => { kpis.push(...r); return ok("created", [...r]); }, listBySession: async (sid) => ok("found", kpis.filter((x) => x.planningSessionId === sid)) },
    resources: { appendMany: async (r) => { resources.push(...r); return ok("created", [...r]); }, listBySession: async (sid) => ok("found", resources.filter((x) => x.planningSessionId === sid)) },
    risks: { appendMany: async (r) => { risks.push(...r); return ok("created", [...r]); }, listBySession: async (sid) => ok("found", risks.filter((x) => x.planningSessionId === sid)), listByWorkspace: async (wid) => ok("found", risks.filter((x) => x.workspaceId === wid)) },
    feedback: { append: async (f) => { feedback.push(f); return ok("created", f); }, listBySession: async (sid) => ok("found", feedback.filter((x) => x.planningSessionId === sid)) },
  };
}
