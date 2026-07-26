/* =============================================================================
 * Planning use-cases (Phase D · Sprint D5) — timelines, milestones, KPIs.
 *
 * Each: authorize against the loaded aggregate's tenant → pure domain service →
 * persist (optimistic concurrency) → append the append-only activity → DTO.
 * Validations: negative duration, timeline-before-initiative, milestone-after-
 * cancelled-timeline, duplicate milestone order, duplicate KPI name.
 * ========================================================================== */

import {
  completeMilestone as domainCompleteMilestone,
  createKpi as buildKpi,
  createMilestone as buildMilestone,
  isValidTimelineDates,
  missMilestone as domainMissMilestone,
  transitionTimeline,
  updateKpi as domainUpdateKpi,
} from "@brightloop/domain";
import { kpiSchema, timelineSchema, txMilestoneSchema, type ActivitySubjectType, type Kpi, type TimelineStatus, type TransformationActivityType } from "@brightloop/schema";
import {
  authorize,
  requireExecution,
  KPI_WRITE_CAP,
  MILESTONE_WRITE_CAP,
  TIMELINE_WRITE_CAP,
  type AppContext,
} from "../context.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import { toKpiDTO, toMilestoneDTO, toInitiativeTimelineDTO, type KpiDTO, type MilestoneDTO, type TimelineDTO } from "./dto.js";

type Exec = ReturnType<typeof requireExecution>;

async function appendActivity(ctx: AppContext, exec: Exec, a: { workspaceId: string; clientId: string | null; type: TransformationActivityType; subjectType: ActivitySubjectType; subjectId: string; summary: string; commandId: string }): Promise<void> {
  unwrap(await exec.activities.append({ id: ctx.ids("act"), at: ctx.clock(), ...a }));
}

/* ---- Timeline -------------------------------------------------------------- */

export async function createTimeline(ctx: AppContext, rawInitiativeId: unknown, input: { startDate: string; targetEndDate: string }): Promise<TimelineDTO> {
  const initiativeId = requireId(rawInitiativeId, "initiativeId");
  const exec = requireExecution(ctx);
  const initiative = unwrap(await exec.initiatives.getById(initiativeId));
  if (initiative === null) throw new NotFoundError("initiative");
  authorize(ctx.actor, TIMELINE_WRITE_CAP, initiative.clientId);
  if (!isValidTimelineDates(input.startDate, input.targetEndDate)) throw new ValidationError("Timeline end date must not precede its start date");
  if (unwrap(await exec.timelines.getByInitiative(initiativeId)) !== null) throw new ConflictError("This initiative already has a timeline");

  const timeline = timelineSchema.parse({ id: ctx.ids("tl"), initiativeId, workspaceId: initiative.workspaceId, clientId: initiative.clientId, startDate: input.startDate, targetEndDate: input.targetEndDate, actualEndDate: null, status: "planned", version: 1, createdAt: ctx.clock() });
  unwrap(await exec.timelines.create(timeline));
  return toInitiativeTimelineDTO(timeline);
}

async function timelineTransition(ctx: AppContext, rawTimelineId: unknown, to: Exclude<TimelineStatus, "planned">): Promise<TimelineDTO> {
  const id = requireId(rawTimelineId, "timelineId");
  const exec = requireExecution(ctx);
  const timeline = unwrap(await exec.timelines.getById(id));
  if (timeline === null) throw new NotFoundError("timeline");
  authorize(ctx.actor, TIMELINE_WRITE_CAP, timeline.clientId);
  if (timeline.status === to) return toInitiativeTimelineDTO(timeline);
  const outcome = transitionTimeline(timeline, to, ctx.clock());
  if (!outcome.ok) throw new ConflictError(`Cannot move a timeline from ${timeline.status} to ${to}`);
  const saved = await exec.timelines.save(outcome.value.timeline, timeline.version);
  if (!saved.ok) {
    if (saved.code === "conflict" || saved.code === "serialization_conflict") throw new ConflictError("The timeline changed concurrently; reload and retry");
    unwrap(saved);
  }
  await appendActivity(ctx, exec, { workspaceId: timeline.workspaceId, clientId: timeline.clientId, type: outcome.value.activityType, subjectType: "timeline", subjectId: id, summary: outcome.value.summary, commandId: `${id}:${to}` });
  return toInitiativeTimelineDTO(unwrap(saved));
}

export const startTimeline = (ctx: AppContext, timelineId: unknown): Promise<TimelineDTO> => timelineTransition(ctx, timelineId, "active");
export const completeTimeline = (ctx: AppContext, timelineId: unknown): Promise<TimelineDTO> => timelineTransition(ctx, timelineId, "completed");
export const cancelTimeline = (ctx: AppContext, timelineId: unknown): Promise<TimelineDTO> => timelineTransition(ctx, timelineId, "cancelled");

/* ---- Milestone ------------------------------------------------------------- */

export async function createMilestone(ctx: AppContext, rawInitiativeId: unknown, input: { title: string; description?: string | null; plannedDate: string; order?: number }): Promise<MilestoneDTO> {
  const initiativeId = requireId(rawInitiativeId, "initiativeId");
  const exec = requireExecution(ctx);
  const initiative = unwrap(await exec.initiatives.getById(initiativeId));
  if (initiative === null) throw new NotFoundError("initiative");
  authorize(ctx.actor, MILESTONE_WRITE_CAP, initiative.clientId);

  const timeline = unwrap(await exec.timelines.getByInitiative(initiativeId));
  if (timeline !== null && timeline.status === "cancelled") throw new ConflictError("Cannot add a milestone to a cancelled timeline");
  const existing = unwrap(await exec.milestones.listByInitiative(initiativeId));
  const order = input.order ?? existing.length;
  if (existing.some((m) => m.order === order)) throw new ConflictError(`A milestone with order ${order} already exists`);

  const milestone = txMilestoneSchema.parse(buildMilestone({ id: ctx.ids("ms"), initiativeId, workspaceId: initiative.workspaceId, clientId: initiative.clientId, title: input.title, description: input.description ?? null, plannedDate: input.plannedDate, order, now: ctx.clock() }));
  unwrap(await exec.milestones.create(milestone));
  await appendActivity(ctx, exec, { workspaceId: milestone.workspaceId, clientId: milestone.clientId, type: "milestone_created", subjectType: "milestone", subjectId: milestone.id, summary: `Milestone "${milestone.title}" created.`, commandId: `${milestone.id}:created` });
  return toMilestoneDTO(milestone);
}

async function milestoneTransition(ctx: AppContext, rawId: unknown, to: "completed" | "missed"): Promise<MilestoneDTO> {
  const id = requireId(rawId, "milestoneId");
  const exec = requireExecution(ctx);
  const milestone = unwrap(await exec.milestones.getById(id));
  if (milestone === null) throw new NotFoundError("milestone");
  authorize(ctx.actor, MILESTONE_WRITE_CAP, milestone.clientId);
  if (milestone.status === to) return toMilestoneDTO(milestone);
  const outcome = to === "completed" ? domainCompleteMilestone(milestone, ctx.clock()) : domainMissMilestone(milestone);
  if (!outcome.ok) throw new ConflictError(`Cannot mark a ${milestone.status} milestone as ${to}`);
  const saved = await exec.milestones.save(outcome.value.milestone, milestone.version);
  if (!saved.ok) {
    if (saved.code === "conflict" || saved.code === "serialization_conflict") throw new ConflictError("The milestone changed concurrently; reload and retry");
    unwrap(saved);
  }
  await appendActivity(ctx, exec, { workspaceId: milestone.workspaceId, clientId: milestone.clientId, type: outcome.value.activityType, subjectType: "milestone", subjectId: id, summary: outcome.value.summary, commandId: `${id}:${to}` });
  return toMilestoneDTO(unwrap(saved));
}

export const completeMilestone = (ctx: AppContext, milestoneId: unknown): Promise<MilestoneDTO> => milestoneTransition(ctx, milestoneId, "completed");
export const missMilestone = (ctx: AppContext, milestoneId: unknown): Promise<MilestoneDTO> => milestoneTransition(ctx, milestoneId, "missed");

/* ---- KPI ------------------------------------------------------------------- */

export async function createKpi(ctx: AppContext, rawWorkspaceId: unknown, input: { name: string; target: number; current?: number; unit?: string }): Promise<KpiDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const exec = requireExecution(ctx);
  const workspace = unwrap(await exec.workspaces.getById(workspaceId));
  if (workspace === null) throw new NotFoundError("transformation workspace");
  authorize(ctx.actor, KPI_WRITE_CAP, workspace.clientId);
  const existing = unwrap(await exec.kpis.listByWorkspace(workspaceId));
  if (existing.some((k) => k.name.trim().toLowerCase() === input.name.trim().toLowerCase())) throw new ConflictError(`A KPI named "${input.name}" already exists`);

  const kpi: Kpi = kpiSchema.parse(buildKpi({ id: ctx.ids("kpi"), workspaceId, clientId: workspace.clientId, name: input.name, target: input.target, current: input.current ?? 0, unit: input.unit ?? "", now: ctx.clock() }));
  unwrap(await exec.kpis.create(kpi));
  await appendActivity(ctx, exec, { workspaceId, clientId: workspace.clientId, type: "kpi_updated", subjectType: "kpi", subjectId: kpi.id, summary: `KPI "${kpi.name}" created (${kpi.status}).`, commandId: `${kpi.id}:created` });
  return toKpiDTO(kpi);
}

export async function updateKpi(ctx: AppContext, rawKpiId: unknown, current: number): Promise<KpiDTO> {
  const id = requireId(rawKpiId, "kpiId");
  const exec = requireExecution(ctx);
  const kpi = unwrap(await exec.kpis.getById(id));
  if (kpi === null) throw new NotFoundError("kpi");
  authorize(ctx.actor, KPI_WRITE_CAP, kpi.clientId);
  const next = domainUpdateKpi(kpi, current, ctx.clock());
  const saved = await exec.kpis.save(next, kpi.version);
  if (!saved.ok) {
    if (saved.code === "conflict" || saved.code === "serialization_conflict") throw new ConflictError("The KPI changed concurrently; reload and retry");
    unwrap(saved);
  }
  await appendActivity(ctx, exec, { workspaceId: kpi.workspaceId, clientId: kpi.clientId, type: "kpi_updated", subjectType: "kpi", subjectId: id, summary: `KPI "${kpi.name}" updated to ${current} (${next.status}).`, commandId: `${id}:updated:${next.version}` });
  return toKpiDTO(unwrap(saved));
}
