"use server";

import { revalidatePath } from "next/cache";
import { assertCapability } from "@brightloop/domain";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { performTransition } from "./transition-service";

/**
 * Admin delivery + CRM write actions (handoff §08).
 *
 * Two kinds of mutation live here:
 *   * STATUS changes go through performTransition() — capability + can() guard +
 *     audit. They never patch a status column directly.
 *   * plain field edits (name, value, contact) go straight to the table under
 *     RLS, which already restricts writes to internal roles.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Same shape as the public signup's check — a pragmatic format guard, not RFC 5322. */
const LEAD_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function authorizeWrite(capability: string) {
  const actor = await getActor();
  if (!actor) throw new Error("Not signed in");
  assertCapability(actor, capability);
  return { actor, supabase: await createClient() };
}

/* =============================================================================
 * LEADS  (machine: lead — new → qualified → proposal_sent → won | lost)
 * ========================================================================== */

export async function createLead(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await authorizeWrite("clients.create");
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const company = String(formData.get("company") ?? "").trim();
    if (!name || !email) return { ok: false, error: "Name and email are required" };
    if (name.length > 120 || company.length > 160) {
      return { ok: false, error: "Name or company is too long" };
    }
    // The client form is noValidate, so the server is the only email check —
    // never persist a malformed address that downstream flows would try to email.
    if (!LEAD_EMAIL_RE.test(email) || email.length > 254) {
      return { ok: false, error: "Enter a valid email address" };
    }

    const valueRaw = String(formData.get("value") ?? "0").trim();
    const value = Math.round(Number(valueRaw) * 100); // dollars → cents
    if (!Number.isFinite(value) || value < 0) return { ok: false, error: "Value must be 0 or more" };

    const { error } = await supabase.from("leads").insert({
      id: id("lead"),
      name,
      email,
      company,
      industry: String(formData.get("industry") ?? "").trim().slice(0, 80),
      value,
      source: String(formData.get("source") ?? "").trim().slice(0, 80),
      stage: "new", // every lead starts new; movement is a guarded transition
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/leads");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create lead" };
  }
}

/**
 * Move a lead through its pipeline. THE guarded path.
 *
 * new→proposal_sent is rejected (must qualify first). →won is where a real CRM
 * would convert the lead to a Client; that conversion lands with the client
 * detail work — for now the stage change is guarded and audited, and conversion
 * is a follow-up the UI flags rather than silently doing.
 */
export async function moveLeadStage(formData: FormData): Promise<ActionResult> {
  const result = await performTransition({
    table: "leads",
    machine: "lead",
    entityId: String(formData.get("id") ?? ""),
    to: String(formData.get("to") ?? ""),
    capability: "clients.update",
  });
  if (result.ok) revalidatePath("/admin/leads");
  return { ok: result.ok, error: result.error };
}

/* =============================================================================
 * CLIENTS  (machine: clientLifecycle)
 * ========================================================================== */

export async function createClientOrg(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await authorizeWrite("clients.create");
    const company = String(formData.get("company") ?? "").trim();
    if (!company) return { ok: false, error: "Company is required" };

    const { error } = await supabase.from("clients").insert({
      id: id("cli"),
      company,
      industry: String(formData.get("industry") ?? "").trim(),
      plan: String(formData.get("plan") ?? "").trim(),
      lifecycle: "prospect", // guarded from here
      seats: 0,
      mrr: 0,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/clients");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create client" };
  }
}

export async function moveClientLifecycle(formData: FormData): Promise<ActionResult> {
  const result = await performTransition({
    table: "clients",
    machine: "clientLifecycle",
    entityId: String(formData.get("id") ?? ""),
    to: String(formData.get("to") ?? ""),
    capability: "clients.update",
  });
  if (result.ok) revalidatePath("/admin/clients");
  return { ok: result.ok, error: result.error };
}

/* =============================================================================
 * PROJECTS  (machine: project)
 * ========================================================================== */

export async function createProject(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await authorizeWrite("projects.update");
    const clientId = String(formData.get("clientId") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    if (!clientId || !name) return { ok: false, error: "Client and project name are required" };

    const { error } = await supabase.from("projects").insert({
      id: id("prj"),
      client_id: clientId,
      name,
      status: "created", // guarded from here
      progress: 0,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/projects");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create project" };
  }
}

export async function moveProjectStatus(formData: FormData): Promise<ActionResult> {
  // paused/delayed require a reason + revised target date (handoff §08).
  const to = String(formData.get("to") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if ((to === "paused" || to === "delayed") && !reason) {
    return { ok: false, error: `A reason is required to mark a project ${to}` };
  }

  const patch: Record<string, unknown> = {};
  const revised = String(formData.get("targetDate") ?? "").trim();
  if (revised) patch["target_date"] = revised;

  const result = await performTransition({
    table: "projects",
    machine: "project",
    entityId: String(formData.get("id") ?? ""),
    to,
    capability: "projects.update",
    reason: reason || null,
    patch,
  });
  if (result.ok) {
    revalidatePath("/admin/projects");
    revalidatePath(`/admin/projects/${String(formData.get("id") ?? "")}`);
  }
  return { ok: result.ok, error: result.error };
}

/* =============================================================================
 * MILESTONES + DELIVERABLES  (the delivery spine)
 *
 * Project.progress is DERIVED from milestone completion (handoff §02.4), so it
 * is recomputed on every milestone status change rather than stored by hand.
 * ========================================================================== */

/** Recompute a project's % progress from its milestones' completion. */
async function recomputeProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<void> {
  const { data } = await supabase.from("milestones").select("status").eq("project_id", projectId);
  const rows = data ?? [];
  const progress =
    rows.length === 0 ? 0 : Math.round((rows.filter((m) => m.status === "completed").length / rows.length) * 100);
  await supabase.from("projects").update({ progress }).eq("id", projectId);
}

export async function createMilestone(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await authorizeWrite("projects.update");
    const projectId = String(formData.get("projectId") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    if (!projectId || !title) return { ok: false, error: "Project and title are required" };

    const { count } = await supabase
      .from("milestones")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);

    const { error } = await supabase.from("milestones").insert({
      id: id("mst"),
      project_id: projectId,
      title,
      status: "pending",
      order: count ?? 0,
      due_date: String(formData.get("dueDate") ?? "").trim() || null,
    });
    if (error) return { ok: false, error: error.message };

    await recomputeProgress(supabase, projectId);
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add milestone" };
  }
}

export async function moveMilestoneStatus(formData: FormData): Promise<ActionResult> {
  const projectId = String(formData.get("projectId") ?? "").trim();
  const to = String(formData.get("to") ?? "");

  // Approving stamps approved_at (handoff §02 field contract).
  const patch: Record<string, unknown> = {};
  if (to === "approved") patch["approved_at"] = new Date().toISOString();

  const result = await performTransition({
    table: "milestones",
    machine: "milestone",
    entityId: String(formData.get("id") ?? ""),
    to,
    capability: "projects.update",
    patch,
  });

  if (result.ok && projectId) {
    const supabase = await createClient();
    await recomputeProgress(supabase, projectId);
    revalidatePath(`/admin/projects/${projectId}`);
  }
  return { ok: result.ok, error: result.error };
}

export async function createDeliverable(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await authorizeWrite("deliverables.create");
    const projectId = String(formData.get("projectId") ?? "").trim();
    const milestoneId = String(formData.get("milestoneId") ?? "").trim() || null;
    const title = String(formData.get("title") ?? "").trim();
    if (!projectId || !title) return { ok: false, error: "Project and title are required" };

    const { error } = await supabase.from("deliverables").insert({
      id: id("dlv"),
      project_id: projectId,
      milestone_id: milestoneId,
      title,
      type: String(formData.get("type") ?? "").trim(),
      status: "draft",
      version: 1,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add deliverable" };
  }
}

export async function moveDeliverableStatus(formData: FormData): Promise<ActionResult> {
  const projectId = String(formData.get("projectId") ?? "").trim();

  // revision/reject bump version on the next submit; capture feedback if given.
  const patch: Record<string, unknown> = {};
  const feedback = String(formData.get("feedback") ?? "").trim();
  if (feedback) patch["feedback"] = feedback;

  const result = await performTransition({
    table: "deliverables",
    machine: "deliverable",
    entityId: String(formData.get("id") ?? ""),
    to: String(formData.get("to") ?? ""),
    capability: "deliverables.update",
    patch,
  });
  if (result.ok && projectId) revalidatePath(`/admin/projects/${projectId}`);
  return { ok: result.ok, error: result.error };
}
