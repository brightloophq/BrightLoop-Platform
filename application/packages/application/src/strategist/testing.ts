/* =============================================================================
 * In-memory AI Strategist repositories (Phase E · Sprint E3) — TEST SUPPORT.
 *
 * The session is versioned (optimistic concurrency); everything else is append-
 * only. E1/E2 doubles (mock providers, in-memory knowledge) come from their own
 * testing modules — the Strategist reaches them only via application services.
 * ========================================================================== */

import { ok, type RuntimeResult, type StrategistRepositories } from "@brightloop/domain";
import type {
  BusinessFinding, RiskAssessment, StrategyAnalysis, StrategyCitation, StrategyFeedback,
  StrategyPriorityScore, StrategyRecommendation, StrategySession, TransformationRoadmap,
} from "@brightloop/schema";

const conflict = (): RuntimeResult<never> => ({ ok: false, code: "conflict", message: "version mismatch", detail: null });

export function createInMemoryStrategistRepos(): StrategistRepositories {
  const sessions = new Map<string, StrategySession>();
  const analyses: StrategyAnalysis[] = [];
  const findings: BusinessFinding[] = [];
  const risks: RiskAssessment[] = [];
  const recommendations: StrategyRecommendation[] = [];
  const priorityScores: StrategyPriorityScore[] = [];
  const roadmaps: TransformationRoadmap[] = [];
  const citations: StrategyCitation[] = [];
  const feedback: StrategyFeedback[] = [];

  return {
    sessions: {
      create: async (s) => { sessions.set(s.id, s); return ok("created", s); },
      getById: async (id) => ok("found", sessions.get(id) ?? null),
      listByWorkspace: async (wid) => ok("found", [...sessions.values()].filter((s) => s.workspaceId === wid)),
      save: async (next, expected) => { const cur = sessions.get(next.id); if (!cur || cur.version !== expected) return conflict(); sessions.set(next.id, next); return ok("updated", next); },
    },
    analyses: {
      append: async (a) => { analyses.push(a); return ok("created", a); },
      getBySession: async (sid) => ok("found", [...analyses].reverse().find((a) => a.sessionId === sid) ?? null),
    },
    findings: {
      appendMany: async (rows) => { findings.push(...rows); return ok("created", [...rows]); },
      listBySession: async (sid) => ok("found", findings.filter((f) => f.sessionId === sid)),
    },
    risks: {
      appendMany: async (rows) => { risks.push(...rows); return ok("created", [...rows]); },
      listBySession: async (sid) => ok("found", risks.filter((r) => r.sessionId === sid)),
      listByWorkspace: async (wid) => ok("found", risks.filter((r) => r.workspaceId === wid)),
    },
    recommendations: {
      appendMany: async (rows) => { recommendations.push(...rows); return ok("created", [...rows]); },
      listBySession: async (sid) => ok("found", recommendations.filter((r) => r.sessionId === sid)),
    },
    priorityScores: {
      appendMany: async (rows) => { priorityScores.push(...rows); return ok("created", [...rows]); },
      listBySession: async (sid) => ok("found", priorityScores.filter((p) => p.sessionId === sid)),
    },
    roadmaps: {
      append: async (r) => { roadmaps.push(r); return ok("created", r); },
      getBySession: async (sid) => ok("found", roadmaps.find((r) => r.sessionId === sid) ?? null),
    },
    citations: {
      appendMany: async (rows) => { citations.push(...rows); return ok("created", [...rows]); },
      listBySession: async (sid) => ok("found", citations.filter((c) => c.sessionId === sid)),
    },
    feedback: {
      append: async (f) => { feedback.push(f); return ok("created", f); },
      listBySession: async (sid) => ok("found", feedback.filter((f) => f.sessionId === sid)),
      listByWorkspace: async (wid) => ok("found", feedback.filter((f) => f.workspaceId === wid)),
    },
  };
}
