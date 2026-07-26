/* =============================================================================
 * AI Project Manager use-cases (Phase E · Sprint E4).
 *
 * The Execution Planner turns an APPROVED strategy (E3) into an executable plan
 * that maps directly onto the Phase D execution model, then materializes an
 * approved plan into Phase D using ONLY Phase D application services (createTask /
 * createMilestone / createTimeline / createKpi / linkDependency / openReview) —
 * never writing execution tables directly, never regenerating strategy.
 *
 *   Approved Strategy → Execution/Initiative/Milestone/Task/Dependency/Timeline/
 *   KPI/Review planners → Validation → Persistence → (on approve) Phase D.
 * ========================================================================== */

import {
  buildDependencyPlan, buildExecutionPlan, buildExecutionRisk, buildInitiativePlan, buildKpiPlan, buildMilestonePlan,
  buildPlanningFeedback, buildPlanningSession, buildResourceEstimate, buildReviewPlan, buildTaskPlan, buildTimelinePlan,
  canTransitionPlanning, computeSchedule, estimateResources, validateExecutionPlan as domainValidatePlan,
} from "@brightloop/domain";
import type {
  DependencyPlan, ExecutionRisk, ExecutionRiskSeverity, InitiativePlan, KpiPlan, MilestonePlan, PlanEffort,
  PlanLikelihood, PlanPriority, PlanningFeedbackKind, ResourceEstimate, TaskPlan, TimelinePlan,
} from "@brightloop/schema";
import { getStrategyResult } from "../strategist/strategy-read.js";
import { createTask, linkDependency, openReview } from "../transformation-execution/execution-usecases.js";
import { createKpi, createMilestone, createTimeline } from "../transformation-execution/planning-usecases.js";
import {
  authorize, requireProjectManager, PLANNING_APPROVE_CAP, PLANNING_FEEDBACK_CAP,
  PLANNING_REVIEW_CAP, PLANNING_RUN_CAP, PLANNING_WRITE_CAP, type AppContext,
} from "../context.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import {
  toExecutionPlanDTO, toInitiativePlanDTO, toPlanningFeedbackDTO, toPlanningSessionDTO,
  type ApprovalResultDTO, type ExecutionPlanDTO, type InitiativePlanDTO, type PlanValidationDTO,
  type PlanningFeedbackDTO, type PlanningSessionDTO,
} from "./dto.js";

/* ---- helpers --------------------------------------------------------------- */

const DAY_MS = 86_400_000;
const addDays = (iso: string, days: number): string => new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
const effortToDays: Record<PlanEffort, number> = { low: 2, medium: 5, high: 10 };

async function loadSession(ctx: AppContext, sessionId: string, cap: string) {
  const pm = requireProjectManager(ctx);
  const session = unwrap(await pm.sessions.getById(sessionId));
  if (session === null) throw new NotFoundError("planning session");
  authorize(ctx.actor, cap, session.clientId);
  return { pm, session };
}

/* ---- session --------------------------------------------------------------- */

export interface CreatePlanningSessionInput { strategySessionId: string; title: string; }

export async function createPlanningSession(ctx: AppContext, rawWorkspaceId: unknown, input: CreatePlanningSessionInput): Promise<PlanningSessionDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const strategySessionId = requireId(input.strategySessionId, "strategySessionId");
  const title = requireString(input.title, "title").trim();
  if (title === "") throw new ValidationError("A planning title is required");
  const pm = requireProjectManager(ctx);
  authorize(ctx.actor, PLANNING_WRITE_CAP, ctx.actor.clientId);
  // Confirm the strategy exists + is readable (consumes E3 only via its service).
  await getStrategyResult(ctx, strategySessionId);
  const session = buildPlanningSession({ id: ctx.ids("plan"), workspaceId, clientId: ctx.actor.clientId, strategySessionId, title, requestedByUserId: ctx.actor.userId, now: ctx.clock() });
  unwrap(await pm.sessions.create(session));
  return toPlanningSessionDTO(session);
}

/* ---- Execution Planner: the pipeline --------------------------------------- */

const impactToPriority = (impact: string): PlanPriority => (impact === "high" ? "high" : impact === "low" ? "low" : "medium");

/** Pass 2 — initiatives, derived from the strategy's recommendations + roadmap. */
export async function generateInitiatives(ctx: AppContext, rawSessionId: unknown, targetInitiativeIds: string[] = []): Promise<InitiativePlanDTO[]> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm, session } = await loadSession(ctx, sessionId, PLANNING_RUN_CAP);
  const existing = unwrap(await pm.initiatives.listBySession(sessionId));
  if (existing.length > 0) return existing.sort((a, b) => a.order - b.order).map(toInitiativePlanDTO);

  const strategy = await getStrategyResult(ctx, session.strategySessionId);
  const phaseOf = (recTitle: string): number | null => { const idx = strategy.roadmap.findIndex((p) => p.initiatives.some((t) => t.includes(recTitle) || recTitle.includes(t))); return idx === -1 ? null : idx + 1; };
  const initiatives: InitiativePlan[] = strategy.recommendations.map((rec, i) => buildInitiativePlan({
    id: ctx.ids("iplan"), planningSessionId: sessionId, workspaceId: session.workspaceId, clientId: session.clientId,
    title: rec.title.replace(/^Address:\s*/i, "").slice(0, 200), businessObjective: rec.reasoning || rec.description,
    expectedOutcome: `Expected impact: ${rec.expectedImpact}`, priority: impactToPriority(rec.expectedImpact), owner: rec.recommendedOwner ?? null,
    linkedRecommendationIds: [rec.id], roadmapPhase: phaseOf(rec.title), linkedInitiativeId: targetInitiativeIds[i % Math.max(1, targetInitiativeIds.length)] ?? null, order: i, now: ctx.clock(),
  }));
  if (initiatives.length === 0) throw new ValidationError("The strategy has no recommendations to plan");
  if (canTransitionPlanning(session.status, "planning")) unwrap(await pm.sessions.save({ ...session, status: "planning", updatedAt: ctx.clock(), version: session.version + 1 }, session.version));
  unwrap(await pm.initiatives.appendMany(initiatives));
  return initiatives.map(toInitiativePlanDTO);
}

/** Pass 3 — milestones (entry/exit criteria + deliverables) per initiative. */
export async function generateMilestones(ctx: AppContext, rawSessionId: unknown): Promise<number> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm, session } = await loadSession(ctx, sessionId, PLANNING_RUN_CAP);
  if (unwrap(await pm.milestones.listBySession(sessionId)).length > 0) return 0;
  const initiatives = unwrap(await pm.initiatives.listBySession(sessionId));
  const milestones: MilestonePlan[] = initiatives.map((i) => buildMilestonePlan({
    id: ctx.ids("mplan"), initiativePlanId: i.id, planningSessionId: sessionId, workspaceId: session.workspaceId, clientId: session.clientId,
    title: `${i.title} — delivered`, entryCriteria: `Prerequisites for ${i.title} are met`, exitCriteria: i.expectedOutcome || `${i.title} outcome achieved`,
    deliverables: [i.expectedOutcome || i.title], order: 0, now: ctx.clock(),
  }));
  unwrap(await pm.milestones.appendMany(milestones));
  return milestones.length;
}

/** Pass 4 — tasks (2 chained per initiative) with acceptance criteria + effort. */
export async function generateTasks(ctx: AppContext, rawSessionId: unknown): Promise<number> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm, session } = await loadSession(ctx, sessionId, PLANNING_RUN_CAP);
  if (unwrap(await pm.tasks.listBySession(sessionId)).length > 0) return 0;
  const initiatives = unwrap(await pm.initiatives.listBySession(sessionId));
  const owner = session.requestedByUserId;
  const tasks: TaskPlan[] = [];
  let order = 0;
  for (const i of initiatives) {
    const plan = buildTaskPlan({ id: ctx.ids("tplan"), initiativePlanId: i.id, planningSessionId: sessionId, workspaceId: session.workspaceId, clientId: session.clientId, title: `Plan: ${i.title}`, description: `Scope + design work for ${i.title}`, acceptanceCriteria: ["Scope agreed", "Design approved"], owner, priority: i.priority, effort: "medium", estimatedDurationDays: effortToDays.medium, relatedRecommendationId: i.linkedRecommendationIds[0] ?? null, order: order++, now: ctx.clock() });
    const exec = buildTaskPlan({ id: ctx.ids("tplan"), initiativePlanId: i.id, planningSessionId: sessionId, workspaceId: session.workspaceId, clientId: session.clientId, title: `Execute: ${i.title}`, description: `Implement ${i.title}`, acceptanceCriteria: [i.expectedOutcome || "Outcome delivered"], owner, priority: i.priority, effort: "high", dependencyTaskIds: [plan.id], estimatedDurationDays: effortToDays.high, requiredKnowledge: [i.title], relatedRecommendationId: i.linkedRecommendationIds[0] ?? null, order: order++, now: ctx.clock() });
    tasks.push(plan, exec);
  }
  unwrap(await pm.tasks.appendMany(tasks));
  return tasks.length;
}

/** Pass 5 — dependency edges from the task graph. */
export async function generateDependencies(ctx: AppContext, rawSessionId: unknown): Promise<number> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm, session } = await loadSession(ctx, sessionId, PLANNING_RUN_CAP);
  if (unwrap(await pm.dependencies.listBySession(sessionId)).length > 0) return 0;
  const tasks = unwrap(await pm.tasks.listBySession(sessionId));
  const deps: DependencyPlan[] = [];
  for (const t of tasks) for (const dep of t.dependencyTaskIds) deps.push(buildDependencyPlan(ctx.ids("dplan"), sessionId, session.workspaceId, session.clientId, dep, t.id, "finish_to_start", ctx.clock()));
  if (deps.length > 0) unwrap(await pm.dependencies.appendMany(deps));
  return deps.length;
}

/** Pass 6 — timelines (CPM per initiative). Returns the critical-path duration. */
export async function generateTimeline(ctx: AppContext, rawSessionId: unknown): Promise<number> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm, session } = await loadSession(ctx, sessionId, PLANNING_RUN_CAP);
  const tasks = unwrap(await pm.tasks.listBySession(sessionId));
  const schedule = computeSchedule(tasks.map((t) => ({ id: t.id, durationDays: t.estimatedDurationDays, dependencyTaskIds: t.dependencyTaskIds })));
  if (schedule.hasCycle) throw new ConflictError("The task plan contains a dependency cycle");
  if (unwrap(await pm.timelines.listBySession(sessionId)).length > 0) return schedule.criticalPathDurationDays;
  const byTask = new Map(schedule.schedules.map((s) => [s.taskId, s]));
  const byInitiative = new Map<string, TaskPlan[]>();
  for (const t of tasks) byInitiative.set(t.initiativePlanId, [...(byInitiative.get(t.initiativePlanId) ?? []), t]);
  const timelines: TimelinePlan[] = [];
  for (const [initiativePlanId, its] of byInitiative) {
    const sched = its.map((t) => byTask.get(t.id)!).filter(Boolean);
    const start = Math.min(...sched.map((s) => s.startDay));
    const finish = Math.max(...sched.map((s) => s.finishDay));
    timelines.push(buildTimelinePlan(ctx.ids("tlplan"), initiativePlanId, sessionId, session.workspaceId, session.clientId, start, finish, finish - start, Math.min(...sched.map((s) => s.slackDays)), sched.some((s) => s.onCriticalPath), ctx.clock()));
  }
  if (timelines.length > 0) unwrap(await pm.timelines.appendMany(timelines));
  return schedule.criticalPathDurationDays;
}

/** Pass 7 — KPIs (measurable, with formula/target/baseline/frequency). */
export async function generateKPIs(ctx: AppContext, rawSessionId: unknown): Promise<number> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm, session } = await loadSession(ctx, sessionId, PLANNING_RUN_CAP);
  if (unwrap(await pm.kpis.listBySession(sessionId)).length > 0) return 0;
  const strategy = await getStrategyResult(ctx, session.strategySessionId);
  const kpis: KpiPlan[] = strategy.recommendations.slice(0, 3).map((rec, i) => buildKpiPlan({
    id: ctx.ids("kplan"), planningSessionId: sessionId, workspaceId: session.workspaceId, clientId: session.clientId,
    name: `${rec.title.replace(/^Address:\s*/i, "").slice(0, 80)} — impact`, formula: "delivered / target * 100", target: 100, baseline: 0, unit: "%", measurementFrequency: i === 0 ? "weekly" : "monthly", now: ctx.clock(),
  }));
  if (kpis.length === 0) kpis.push(buildKpiPlan({ id: ctx.ids("kplan"), planningSessionId: sessionId, workspaceId: session.workspaceId, clientId: session.clientId, name: "Plan completion", formula: "completed / total * 100", target: 100, unit: "%", now: ctx.clock() }));
  unwrap(await pm.kpis.appendMany(kpis));
  return kpis.length;
}

/** The orchestrator: run all planners, add review/risks/resources, validate, persist the plan. */
export async function generateExecutionPlan(ctx: AppContext, rawSessionId: unknown, opts: { targetInitiativeIds?: string[] } = {}): Promise<ExecutionPlanDTO> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm, session } = await loadSession(ctx, sessionId, PLANNING_RUN_CAP);
  const startedAt = ctx.clock();

  await generateInitiatives(ctx, sessionId, opts.targetInitiativeIds ?? []);
  await generateMilestones(ctx, sessionId);
  await generateTasks(ctx, sessionId);
  await generateDependencies(ctx, sessionId);
  const criticalPath = await generateTimeline(ctx, sessionId);
  await generateKPIs(ctx, sessionId);

  const [initiatives, tasks, milestones, kpis] = await Promise.all([
    pm.initiatives.listBySession(sessionId).then(unwrap), pm.tasks.listBySession(sessionId).then(unwrap),
    pm.milestones.listBySession(sessionId).then(unwrap), pm.kpis.listBySession(sessionId).then(unwrap),
  ]);

  // Review plan (one per session) + risks (from strategy) + resources (per initiative).
  if (unwrap(await pm.reviews.getBySession(sessionId)) === null) {
    unwrap(await pm.reviews.append(buildReviewPlan({ id: ctx.ids("rvplan"), planningSessionId: sessionId, workspaceId: session.workspaceId, clientId: session.clientId, cadence: "per_milestone", approvalGates: ["Plan approved", "Phase gate review"], qualityGates: ["Acceptance criteria met"], successMetrics: kpis.map((k) => k.name), now: ctx.clock() })));
  }
  if (unwrap(await pm.risks.listBySession(sessionId)).length === 0) {
    const strategy = await getStrategyResult(ctx, session.strategySessionId);
    const risks: ExecutionRisk[] = strategy.risks.slice(0, 5).map((r) => buildExecutionRisk({ id: ctx.ids("erisk"), planningSessionId: sessionId, workspaceId: session.workspaceId, clientId: session.clientId, category: "delivery", title: r.title, description: r.description, severity: r.severity as ExecutionRiskSeverity, likelihood: r.likelihood as PlanLikelihood, mitigation: r.mitigation, contingency: "Escalate to the review gate.", now: ctx.clock() }));
    if (risks.length > 0) unwrap(await pm.risks.appendMany(risks));
  }
  if (unwrap(await pm.resources.listBySession(sessionId)).length === 0) {
    const resources: ResourceEstimate[] = initiatives.map((i) => { const its = tasks.filter((t) => t.initiativePlanId === i.id); const est = estimateResources(its); return buildResourceEstimate({ id: ctx.ids("resest"), initiativePlanId: i.id, planningSessionId: sessionId, workspaceId: session.workspaceId, clientId: session.clientId, people: est.people, skills: [...new Set(its.flatMap((t) => t.requiredKnowledge))], costCategory: est.costCategory, complexity: est.complexity, durationDays: est.durationDays, confidence: est.confidence, now: ctx.clock() }); });
    if (resources.length > 0) unwrap(await pm.resources.appendMany(resources));
  }

  const validation = domainValidatePlan({ initiatives, tasks, milestones, kpis });
  const confidence = validation.ok ? Math.min(90, 50 + tasks.length * 2) : 30;
  let plan = unwrap(await pm.plans.getBySession(sessionId));
  if (plan === null) {
    plan = buildExecutionPlan({ id: ctx.ids("explan"), planningSessionId: sessionId, workspaceId: session.workspaceId, clientId: session.clientId, summary: `Execution plan for "${session.title}": ${initiatives.length} initiatives, ${tasks.length} tasks, critical path ${criticalPath}d.`, initiativeCount: initiatives.length, taskCount: tasks.length, milestoneCount: milestones.length, kpiCount: kpis.length, riskCount: unwrap(await pm.risks.listBySession(sessionId)).length, criticalPathDurationDays: criticalPath, confidence, now: ctx.clock() });
    plan = { ...plan, status: validation.ok ? "validated" : "draft" };
    unwrap(await pm.plans.append(plan));
  }
  const endedAt = ctx.clock();
  const planSize = initiatives.length + tasks.length + milestones.length + kpis.length;
  // Reload — the sub-planners advanced the session to `planning`; transition from
  // its CURRENT status (with its current version) to `planned` when valid.
  const current = unwrap(await pm.sessions.getById(sessionId));
  if (current !== null && validation.ok && canTransitionPlanning(current.status, "planned")) {
    unwrap(await pm.sessions.save({ ...current, status: "planned", planSize, confidence, planningDurationMs: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)), updatedAt: endedAt, version: current.version + 1 }, current.version));
  }
  return toExecutionPlanDTO(plan);
}

/* ---- validation ------------------------------------------------------------ */

export async function validateExecutionPlan(ctx: AppContext, rawSessionId: unknown): Promise<PlanValidationDTO> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm } = await loadSession(ctx, sessionId, PLANNING_REVIEW_CAP);
  const [initiatives, tasks, milestones, kpis] = await Promise.all([
    pm.initiatives.listBySession(sessionId).then(unwrap), pm.tasks.listBySession(sessionId).then(unwrap),
    pm.milestones.listBySession(sessionId).then(unwrap), pm.kpis.listBySession(sessionId).then(unwrap),
  ]);
  return domainValidatePlan({ initiatives, tasks, milestones, kpis });
}

/* ---- approval → materialize into Phase D ----------------------------------- */

export async function approveExecutionPlan(ctx: AppContext, rawSessionId: unknown): Promise<ApprovalResultDTO> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm, session } = await loadSession(ctx, sessionId, PLANNING_APPROVE_CAP);
  if (session.status === "approved") return { planningSessionId: sessionId, materialized: { tasks: 0, milestones: 0, timelines: 0, kpis: 0, reviews: 0, dependencies: 0 } };
  if (!canTransitionPlanning(session.status, "approved")) throw new ConflictError(`Cannot approve a ${session.status} plan`);

  const [initiatives, tasks, milestones, timelines, kpis] = await Promise.all([
    pm.initiatives.listBySession(sessionId).then(unwrap), pm.tasks.listBySession(sessionId).then(unwrap),
    pm.milestones.listBySession(sessionId).then(unwrap), pm.timelines.listBySession(sessionId).then(unwrap),
    pm.kpis.listBySession(sessionId).then(unwrap),
  ]);
  const validation = domainValidatePlan({ initiatives, tasks, milestones, kpis });
  if (!validation.ok) throw new ValidationError(`Cannot approve an invalid plan: ${validation.issues.join("; ")}`);

  const counts = { tasks: 0, milestones: 0, timelines: 0, kpis: 0, reviews: 0, dependencies: 0 };
  const now = ctx.clock();
  // Materialize into Phase D ONLY via its application services; only initiatives
  // linked to a real Phase D initiative are materialized.
  const linkedIds: string[] = [];
  for (const initiative of initiatives) {
    if (initiative.linkedInitiativeId === null) continue;
    const initId = initiative.linkedInitiativeId;
    linkedIds.push(initId);
    await openReview(ctx, initId); counts.reviews += 1;
    for (const t of tasks.filter((x) => x.initiativePlanId === initiative.id)) { await createTask(ctx, initId, { title: t.title.slice(0, 200), description: t.description, priority: t.priority }); counts.tasks += 1; }
    for (const m of milestones.filter((x) => x.initiativePlanId === initiative.id)) { await createMilestone(ctx, initId, { title: m.title.slice(0, 200), description: m.exitCriteria, plannedDate: m.plannedDate ?? addDays(now, 30) }); counts.milestones += 1; }
    const tl = timelines.find((x) => x.initiativePlanId === initiative.id);
    // A Phase D initiative allows one timeline; skip if this initiative already has one
    // (several plan initiatives can map to the same Phase D initiative).
    if (tl !== undefined) { try { await createTimeline(ctx, initId, { startDate: addDays(now, tl.startDay), targetEndDate: addDays(now, Math.max(tl.finishDay, tl.startDay + 1)) }); counts.timelines += 1; } catch { /* initiative already has a timeline */ } }
  }
  // Sequential-initiative dependencies (finish-to-start) between linked initiatives.
  for (let i = 1; i < linkedIds.length; i += 1) {
    try { await linkDependency(ctx, session.workspaceId, linkedIds[i]!, linkedIds[i - 1]!, "depends_on"); counts.dependencies += 1; } catch { /* skip duplicate/cyclic edges */ }
  }
  // KPIs are workspace-level in Phase D.
  for (const k of kpis) { try { await createKpi(ctx, session.workspaceId, { name: k.name.slice(0, 120), target: k.target, unit: k.unit }); counts.kpis += 1; } catch { /* duplicate KPI name */ } }

  const plan = unwrap(await pm.plans.getBySession(sessionId));
  if (plan !== null) unwrap(await pm.plans.save({ ...plan, status: "approved" }));
  unwrap(await pm.sessions.save({ ...session, status: "approved", updatedAt: ctx.clock(), version: session.version + 1 }, session.version));
  return { planningSessionId: sessionId, materialized: counts };
}

/* ---- feedback -------------------------------------------------------------- */

export interface SubmitPlanningFeedbackInput { kind: PlanningFeedbackKind; rating?: number | null; comment?: string | null; }

export async function submitPlanningFeedback(ctx: AppContext, rawSessionId: unknown, input: SubmitPlanningFeedbackInput): Promise<PlanningFeedbackDTO> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm, session } = await loadSession(ctx, sessionId, PLANNING_FEEDBACK_CAP);
  const feedback = buildPlanningFeedback(ctx.ids("pfb"), sessionId, session.workspaceId, session.clientId, input.kind, input.rating ?? null, input.comment ?? null, ctx.actor.userId, ctx.clock());
  unwrap(await pm.feedback.append(feedback));
  return toPlanningFeedbackDTO(feedback);
}
