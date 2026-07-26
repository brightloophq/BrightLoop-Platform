"use server";

/* =============================================================================
 * Transformation Execution server actions (Phase D · Sprint D1).
 *
 * The ONLY write path for D1: seed a Transformation Workspace from a certified
 * scan. Authenticate → the seed use-case (which authorizes `transformation.write`
 * against the scan's tenant, reads the proposal read-only, and persists
 * idempotently) → revalidate. React never touches a repository or a runtime
 * service. Seeding is idempotent, so a double-submit returns the same workspace.
 * ========================================================================== */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  activateInitiative,
  approveReview,
  archiveInitiative,
  archiveNotification,
  assignTask,
  blockTask,
  calculateProgress,
  calculateWorkspaceHealth,
  cancelTimeline,
  createMention,
  completeInitiative,
  completeMilestone,
  completeTask,
  completeTimeline,
  createKpi,
  createMilestone,
  createTask,
  createTimeline,
  dismissNotification,
  isApplicationError,
  linkDependency,
  markRead,
  markUnread,
  missMilestone,
  openReview,
  planInitiative,
  rejectReview,
  removeTaskAssignment,
  requestChanges,
  seedTransformation,
  startTask,
  startTimeline,
  subscribe,
  unlinkDependency,
  unsubscribe,
  updateKpi,
} from "@brightloop/application";
import type { ActivitySubjectType, DependencyType, SubscriptionTargetType } from "@brightloop/schema";
import { buildAppContext } from "@/lib/runtime-api";

const TRANSFORMATION_PATH = "/admin/transformation";

/** The four initiative lifecycle transitions, keyed by the form's `action` field. */
const TRANSITIONS = { plan: planInitiative, activate: activateInitiative, complete: completeInitiative, archive: archiveInitiative } as const;
type TransitionKey = keyof typeof TRANSITIONS;

/**
 * Seed (or return the existing) transformation workspace for a scan run id, then
 * redirect to it. Idempotent — a double-submit lands on the same workspace. On a
 * known application error, redirect back with a surfaced message.
 */
export async function seedTransformationFormAction(formData: FormData): Promise<void> {
  const scanRunId = String(formData.get("scanRunId") ?? "").trim();
  if (scanRunId === "") redirect(`${TRANSFORMATION_PATH}?error=${encodeURIComponent("Enter a certified scan run id.")}`);

  let workspaceId: string;
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    const detail = await seedTransformation(ctx!, scanRunId);
    workspaceId = detail.workspace.id;
  } catch (error) {
    const message = isApplicationError(error) ? error.message : "Couldn't seed a workspace from that scan.";
    redirect(`${TRANSFORMATION_PATH}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(TRANSFORMATION_PATH);
  redirect(`${TRANSFORMATION_PATH}/${workspaceId}`);
}

/**
 * Transition an initiative's lifecycle (D2), then reload the workspace. The button
 * is only rendered for the legal next action, but the use-case re-validates the
 * transition and is idempotent, so a stale double-click is safe.
 */
export async function transitionInitiativeFormAction(formData: FormData): Promise<void> {
  const initiativeId = String(formData.get("initiativeId") ?? "").trim();
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim() as TransitionKey;
  const transition = TRANSITIONS[action];
  const dest = workspaceId === "" ? TRANSFORMATION_PATH : `${TRANSFORMATION_PATH}/${workspaceId}`;
  if (initiativeId === "" || transition === undefined) redirect(`${dest}?error=${encodeURIComponent("Invalid transition request.")}`);

  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await transition(ctx!, initiativeId);
  } catch (error) {
    const message = isApplicationError(error) ? error.message : "Couldn't transition the initiative.";
    redirect(`${dest}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(dest);
  redirect(dest);
}

/* ---- D3/D4 execution-management actions ------------------------------------ */

function backTo(workspaceId: string, error?: string): never {
  const q = error ? `?error=${encodeURIComponent(error)}` : "";
  redirect(`${TRANSFORMATION_PATH}/${workspaceId}${q}`);
}
function msg(error: unknown, fallback: string): string {
  return isApplicationError(error) ? error.message : fallback;
}

/** Open / decide a review (open · approve · request_changes · reject). */
export async function reviewFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const initiativeId = String(formData.get("initiativeId") ?? "");
  const reviewId = String(formData.get("reviewId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    if (decision === "open") await openReview(ctx!, initiativeId);
    else if (decision === "approve") await approveReview(ctx!, reviewId, note);
    else if (decision === "request_changes") await requestChanges(ctx!, reviewId, note);
    else if (decision === "reject") await rejectReview(ctx!, reviewId, note);
    else backTo(workspaceId, "Unknown review action.");
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't update the review.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Create a task under an initiative. */
export async function taskCreateFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const initiativeId = String(formData.get("initiativeId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const priorityRaw = String(formData.get("priority") ?? "medium");
  const priority = (["low", "medium", "high"].includes(priorityRaw) ? priorityRaw : "medium") as "low" | "medium" | "high";
  if (title === "") backTo(workspaceId, "Enter a task title.");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await createTask(ctx!, initiativeId, { title, priority });
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't create the task.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Transition a task (start · complete · block). */
export async function taskTransitionFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  const action = String(formData.get("action") ?? "");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    if (action === "start") await startTask(ctx!, taskId);
    else if (action === "complete") await completeTask(ctx!, taskId);
    else if (action === "block") await blockTask(ctx!, taskId);
    else backTo(workspaceId, "Unknown task action.");
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't move the task.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Assign / reassign / unassign a task owner. */
export async function taskAssignFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  const assignee = String(formData.get("assignee") ?? "").trim();
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    if (assignee === "") await removeTaskAssignment(ctx!, taskId);
    else await assignTask(ctx!, taskId, assignee);
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't update the assignment.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Link an initiative dependency. */
export async function dependencyLinkFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  const typeRaw = String(formData.get("type") ?? "depends_on");
  const type = (["depends_on", "blocks"].includes(typeRaw) ? typeRaw : "depends_on") as DependencyType;
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await linkDependency(ctx!, workspaceId, from, to, type);
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't link the dependency.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Remove an initiative dependency. */
export async function dependencyUnlinkFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const dependencyId = String(formData.get("dependencyId") ?? "");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await unlinkDependency(ctx!, dependencyId);
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't remove the dependency.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/* ---- D5/D6 planning & performance actions ---------------------------------- */

/** Create a timeline for an initiative. */
export async function timelineCreateFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const initiativeId = String(formData.get("initiativeId") ?? "");
  const startDate = String(formData.get("startDate") ?? "").trim();
  const targetEndDate = String(formData.get("targetEndDate") ?? "").trim();
  if (startDate === "" || targetEndDate === "") backTo(workspaceId, "Enter a start and target end date.");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await createTimeline(ctx!, initiativeId, { startDate, targetEndDate });
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't create the timeline.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Transition a timeline (start · complete · cancel). */
export async function timelineTransitionFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const timelineId = String(formData.get("timelineId") ?? "");
  const action = String(formData.get("action") ?? "");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    if (action === "start") await startTimeline(ctx!, timelineId);
    else if (action === "complete") await completeTimeline(ctx!, timelineId);
    else if (action === "cancel") await cancelTimeline(ctx!, timelineId);
    else backTo(workspaceId, "Unknown timeline action.");
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't move the timeline.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Create a milestone under an initiative. */
export async function milestoneCreateFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const initiativeId = String(formData.get("initiativeId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const plannedDate = String(formData.get("plannedDate") ?? "").trim();
  if (title === "" || plannedDate === "") backTo(workspaceId, "Enter a milestone title and planned date.");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await createMilestone(ctx!, initiativeId, { title, plannedDate });
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't create the milestone.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Transition a milestone (complete · miss). */
export async function milestoneTransitionFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const milestoneId = String(formData.get("milestoneId") ?? "");
  const action = String(formData.get("action") ?? "");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    if (action === "complete") await completeMilestone(ctx!, milestoneId);
    else if (action === "miss") await missMilestone(ctx!, milestoneId);
    else backTo(workspaceId, "Unknown milestone action.");
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't move the milestone.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Create a workspace KPI. */
export async function kpiCreateFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const target = Number(formData.get("target") ?? "");
  const current = Number(formData.get("current") ?? "0");
  const unit = String(formData.get("unit") ?? "").trim();
  if (name === "" || !Number.isFinite(target)) backTo(workspaceId, "Enter a KPI name and numeric target.");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await createKpi(ctx!, workspaceId, { name, target, current: Number.isFinite(current) ? current : 0, unit });
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't create the KPI.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Record a new KPI measurement (status is re-derived). */
export async function kpiUpdateFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const kpiId = String(formData.get("kpiId") ?? "");
  const current = Number(formData.get("current") ?? "");
  if (!Number.isFinite(current)) backTo(workspaceId, "Enter a numeric KPI value.");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await updateKpi(ctx!, kpiId, current);
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't update the KPI.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Recompute an initiative's derived progress snapshot. */
export async function progressCalculateFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const initiativeId = String(formData.get("initiativeId") ?? "");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await calculateProgress(ctx!, initiativeId);
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't recalculate progress.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Recompute the workspace's derived health + progress snapshot. */
export async function workspaceHealthFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await calculateWorkspaceHealth(ctx!, workspaceId);
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't recalculate workspace health.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/* ---- D7 collaboration actions ---------------------------------------------- */

const SUBSCRIPTION_TARGETS = ["workspace", "initiative", "task", "review", "timeline", "kpi"] as const;

/** Subscribe the caller to a target within the workspace. */
export async function subscribeFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const targetTypeRaw = String(formData.get("targetType") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  const targetType = (SUBSCRIPTION_TARGETS as readonly string[]).includes(targetTypeRaw) ? (targetTypeRaw as SubscriptionTargetType) : null;
  if (targetType === null) backTo(workspaceId, "Unknown subscription target.");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await subscribe(ctx!, workspaceId, targetType!, targetId);
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't subscribe.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Remove one of the caller's subscriptions. */
export async function unsubscribeFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await unsubscribe(ctx!, subscriptionId);
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't unsubscribe.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Add an internal note on a subject, with optional space-separated @mention user ids. */
export async function noteFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const subjectTypeRaw = String(formData.get("subjectType") ?? "initiative");
  const subjectId = String(formData.get("subjectId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const mentions = String(formData.get("mentions") ?? "").split(/[\s,]+/).map((s) => s.trim()).filter((s) => s !== "");
  if (text === "") backTo(workspaceId, "Enter a note.");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await createMention(ctx!, workspaceId, subjectTypeRaw as ActivitySubjectType, subjectId, text, mentions);
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't add the note.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Inbox lifecycle (read · unread · archive · dismiss). */
export async function inboxFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const inboxItemId = String(formData.get("inboxItemId") ?? "");
  const action = String(formData.get("action") ?? "");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    if (action === "read") await markRead(ctx!, inboxItemId);
    else if (action === "unread") await markUnread(ctx!, inboxItemId);
    else if (action === "archive") await archiveNotification(ctx!, inboxItemId);
    else if (action === "dismiss") await dismissNotification(ctx!, inboxItemId);
    else backTo(workspaceId, "Unknown inbox action.");
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't update the inbox item.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}
