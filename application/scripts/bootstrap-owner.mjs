#!/usr/bin/env node
/* =============================================================================
 * Bootstrap the first internal owner account.
 *
 * WHY THIS EXISTS
 *   There is no public sign-up, by design (handoff §01: accounts are created by
 *   invitation). Client accounts are created at activation; internal accounts are
 *   created by the owner. Which leaves a chicken-and-egg: the FIRST owner has
 *   nobody to create them. This script is that one-time bootstrap.
 *
 * WHAT IT DOES
 *   1. Creates (or finds) a Supabase Auth user for the given email.
 *   2. Inserts a `public.users` row with role='owner', client_id=NULL.
 *   The two are linked by `auth_user_id`, which is what the custom access token
 *   hook reads to stamp the role claim into every JWT.
 *
 * WHY IT NEEDS THE SECRET KEY
 *   Creating auth users and writing the first `users` row both require bypassing
 *   RLS — there is no session yet to authorise it. This runs LOCALLY, from the
 *   owner's machine, reading the key from .env.local. It is not part of the app
 *   and the key never reaches a browser.
 *
 * USAGE
 *   node scripts/bootstrap-owner.mjs <email> [name]
 *
 * AFTERWARDS
 *   You must set a password (Supabase dashboard → Authentication → Users), or
 *   sign in with a magic link.
 *
 * ⚠️ The role claim only reaches your JWT if the custom access token hook is
 *    registered: Dashboard → Authentication → Hooks → Custom Access Token →
 *    public.custom_access_token_hook. Without it you will sign in successfully
 *    and then be denied by every RLS policy.
 * ========================================================================== */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "../apps/web/.env.local");

function loadEnv(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    fail(`Could not read ${path}. Create it from .env.example first.`);
  }
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function fail(msg) {
  console.error(`\n  ERROR: ${msg}\n`);
  process.exit(1);
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
const name = (process.argv[3] ?? "").trim() || "Owner";

if (!email || !email.includes("@")) {
  fail("Usage: node scripts/bootstrap-owner.mjs <email> [name]");
}

const env = loadEnv(envPath);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secret = env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in apps/web/.env.local");
}

const admin = createClient(url, secret, { auth: { persistSession: false } });

/** Prefixed ULID-ish id, matching the handoff's usr_ convention. */
function userId() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `usr_${Date.now().toString(36)}${rand}`;
}

async function findAuthUser(targetEmail) {
  // listUsers is paginated; the bootstrap case has very few users.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Could not list auth users: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === targetEmail);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  console.log(`\n  Bootstrapping owner: ${email}`);

  // ---- 1. auth user ----
  let authUser = await findAuthUser(email);
  if (authUser) {
    console.log(`  · auth user exists (${authUser.id})`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true, // bootstrap account — no confirmation round-trip
    });
    if (error) fail(`Could not create auth user: ${error.message}`);
    authUser = data.user;
    console.log(`  · auth user created (${authUser.id})`);
  }

  // ---- 2. public.users row ----
  const { data: existing, error: readErr } = await admin
    .from("users")
    .select("id, role, auth_user_id")
    .eq("email", email)
    .maybeSingle();
  if (readErr) fail(`Could not read users: ${readErr.message}`);

  if (existing) {
    if (existing.auth_user_id === authUser.id && existing.role === "owner") {
      console.log(`  · users row already correct (${existing.id}, role=owner)`);
    } else {
      const { error } = await admin
        .from("users")
        .update({ auth_user_id: authUser.id, role: "owner", status: "active" })
        .eq("id", existing.id);
      if (error) fail(`Could not update users row: ${error.message}`);
      console.log(`  · users row updated (${existing.id} → role=owner)`);
    }
  } else {
    const id = userId();
    const { error } = await admin.from("users").insert({
      id,
      auth_user_id: authUser.id,
      name,
      email,
      role: "owner",
      client_id: null, // internal roles carry no client_id — enforced by CHECK
      status: "active",
      accepted_at: new Date().toISOString(),
    });
    if (error) fail(`Could not insert users row: ${error.message}`);
    console.log(`  · users row created (${id}, role=owner)`);
  }

  console.log("\n  Done. Next:");
  console.log("   1. Set a password: Dashboard → Authentication → Users → … → Reset password");
  console.log("      (or sign in with a magic link at /login)");
  console.log("   2. REGISTER THE AUTH HOOK if you have not:");
  console.log("      Dashboard → Authentication → Hooks → Custom Access Token");
  console.log("      → public.custom_access_token_hook");
  console.log("      Without it your JWT carries no role and every RLS policy denies.\n");
}

main().catch((e) => fail(e.message));
