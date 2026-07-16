"use server";

import { transition } from "@brightloop/domain";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/analytics";

/**
 * Prospect self-signup at the end of the funnel (approved Decision A).
 *
 * Turns an anonymous prospect into a `member`-stage client with a client_admin
 * account, and persists their funnel work (assessment + configuration) so the
 * discovery chat and admin context panel can read it (Sprint 5B).
 *
 * WHY SERVICE-ROLE
 *   A brand-new prospect has no session, so there is no RLS-authorised path to
 *   create the client org + users row + funnel rows. This is the same
 *   account-provisioning case as bootstrap-owner: legitimate elevated writes
 *   with no prior identity. It runs server-side and the secret never reaches a
 *   browser.
 *
 * ⚠️ ABUSE SURFACE — DOCUMENTED, NOT IGNORED
 *   This is a public endpoint that creates accounts. Without bot protection a
 *   script could mass-create prospects. Cloudflare Turnstile (open decision M)
 *   is the mitigation and is scheduled for the Sprint 9 hardening pass. Until
 *   then this is acceptable for a controlled launch but MUST be gated before
 *   a public opening. Basic guards here: required fields, email shape, and the
 *   account is created UNCONFIRMED-then-confirmed only for the owner's own email
 *   at member stage (no billing, no elevated capability).
 *
 * The lifecycle is modelled honestly: the client is created at `prospect`
 * (the machine's initial state) and immediately walked prospect→member through
 * the guarded transition, which audits the account-creation moment.
 */

export interface SignupState {
  error?: string;
  ok?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

interface FunnelPayload {
  answers?: Record<string, number>;
  scores?: Record<string, number>;
  healthScore?: number | null;
  goal?: string | null;
  plan?: string | null;
  modules?: string[];
  ownedAssets?: string[];
  estimateLow?: number;
  estimateHigh?: number;
}

export async function createProspectAccount(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const name = String(formData.get("name") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name || !company) return { error: "Your name and company are required" };
  if (!EMAIL_RE.test(email) || email.length > 254) return { error: "Enter a valid email" };
  if (password.length < 8 || !/[a-z]/i.test(password) || !/[0-9]/.test(password)) {
    return { error: "Password must be at least 8 characters with a letter and a number" };
  }

  let funnel: FunnelPayload = {};
  try {
    funnel = JSON.parse(String(formData.get("funnel") ?? "{}"));
  } catch {
    /* funnel data optional — account still creates */
  }

  const admin = createServiceRoleClient();

  // 1. auth user
  const { data: au, error: aerr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (aerr) {
    if (/already/i.test(aerr.message)) {
      return { error: "An account with that email already exists. Sign in instead." };
    }
    return { error: "Could not create your account. Please try again." };
  }

  const clientId = id("cli");
  const userId = id("usr");

  try {
    // 2. client org at `prospect` (the machine's initial state)
    const { error: cerr } = await admin.from("clients").insert({
      id: clientId,
      company,
      industry: "",
      plan: funnel.plan ?? "",
      lifecycle: "prospect",
      seats: 1,
      mrr: 0,
    });
    if (cerr) throw new Error(cerr.message);

    // 3. client_admin user
    const { error: uerr } = await admin.from("users").insert({
      id: userId,
      auth_user_id: au.user.id,
      name,
      email,
      role: "client_admin",
      client_id: clientId,
      status: "active",
      accepted_at: new Date().toISOString(),
    });
    if (uerr) throw new Error(uerr.message);

    // 4. persist the funnel work
    const assessmentId = id("asm");
    await admin.from("assessments").insert({
      id: assessmentId,
      client_id: clientId,
      answers: funnel.answers ?? {},
      scores: funnel.scores ?? {},
      health_score: funnel.healthScore ?? null,
      recommendations: [],
      status: "completed",
      submitted_at: new Date().toISOString(),
    });
    await admin.from("configurations").insert({
      id: id("cfg"),
      client_id: clientId,
      assessment_id: assessmentId,
      modules: funnel.modules ?? [],
      owned_assets: funnel.ownedAssets ?? [],
      estimate_low: Math.round(funnel.estimateLow ?? 0),
      estimate_high: Math.round(funnel.estimateHigh ?? 0),
      status: "completed",
    });

    // 5. guarded prospect→member — the account-creation moment, audited
    const record = transition({
      machine: "clientLifecycle",
      entityId: clientId,
      from: "prospect",
      to: "member",
      actorId: userId,
      reason: "prospect created an account",
    });
    await admin.from("transition_log").insert({
      machine: record.machine,
      entity_type: "clients",
      entity_id: record.entityId,
      from_state: record.from,
      to_state: record.to,
      actor_id: record.actorId,
      reason: record.reason,
      at: record.at,
    });
    const { error: lerr } = await admin.from("clients").update({ lifecycle: "member" }).eq("id", clientId);
    if (lerr) throw new Error(lerr.message);

    await emitEvent({ name: "activation.complete", clientId, props: { stage: "member", via: "funnel_signup" } });
  } catch (e) {
    // Roll back so a half-provisioned account can't linger. Best-effort — the
    // postgrest builder isn't a full Promise, so wrap rather than .catch it.
    try {
      await admin.from("clients").delete().eq("id", clientId);
    } catch {
      /* ignore */
    }
    await admin.auth.admin.deleteUser(au.user.id).catch(() => {});
    return { error: e instanceof Error ? e.message : "Could not finish setting up your account" };
  }

  // Sign the new client in on this device.
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email, password });

  return { ok: true };
}
