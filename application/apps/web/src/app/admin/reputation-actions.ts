"use server";

import { revalidatePath } from "next/cache";
import { FACETS, PUBLISH_STATES, RATING_CATEGORIES, type PublishStatus } from "@brightloop/schema";
import { assertCapability } from "@brightloop/domain";
import { getActor } from "@/lib/auth";
import { emitEvent } from "@/lib/analytics";
import { isValidSlug, slugify } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";

/**
 * Reputation CMS write actions (handoff §08 — Portfolio & Reviews moderation).
 *
 * ENFORCEMENT, in order:
 *   1. actor must exist (session)
 *   2. `assertCapability(actor, "marketing.*")` — owner/admin only; team_member
 *      is refused here before any query is built
 *   3. RLS refuses the write anyway if 1–2 were somehow bypassed
 *
 * REVALIDATION ON PUBLISH (handoff §11.3)
 *   Every mutation calls revalidateReputation(). This is the on-demand half that
 *   the 5-minute ISR window was only ever an interim for: publish a case study
 *   and it appears immediately, rather than up to five minutes later. Only the
 *   CMS knows when a publish happened, which is exactly why it lives here.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Blow away every cached surface that renders published reputation content. */
function revalidateReputation(slug?: string): void {
  revalidatePath("/", "page"); // homepage marquee + testimonials
  revalidatePath("/portfolio");
  revalidatePath("/testimonials");
  revalidatePath("/sitemap.xml");
  if (slug) {
    revalidatePath(`/portfolio/${slug}`);
    revalidatePath(`/case-studies/${slug}`);
  }
  revalidatePath("/admin/portfolio");
  revalidatePath("/admin/reviews");
}

async function authorize(capability: string) {
  const actor = await getActor();
  if (!actor) throw new Error("Not signed in");
  assertCapability(actor, capability);
  const supabase = await createClient();
  return { actor, supabase };
}

function parsePublish(value: FormDataEntryValue | null): PublishStatus {
  const v = String(value ?? "");
  if (!(PUBLISH_STATES as readonly string[]).includes(v)) {
    throw new Error(`Invalid publish status: ${v}`);
  }
  return v as PublishStatus;
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* =============================================================================
 * TESTIMONIALS
 * ========================================================================== */

/**
 * Create or update a testimonial.
 *
 * INTEGRITY: new reviews are forced to `draft`. A testimonial reaches the public
 * site only through a deliberate, separate moderation step — never as a
 * side-effect of typing it in. The owner enters what a real client actually said,
 * with their consent; nothing here can author one.
 */
export async function saveTestimonial(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await authorize("marketing.update");

    const existingId = String(formData.get("id") ?? "").trim();
    const categories: Record<string, number> = {};
    for (const key of RATING_CATEGORIES) {
      const n = Number(formData.get(`categories.${key}`));
      if (!Number.isFinite(n) || n < 1 || n > 5) {
        return { ok: false, error: `${key} rating must be between 1 and 5` };
      }
      categories[key] = n;
    }

    const overall = Number(formData.get("overall"));
    if (!Number.isFinite(overall) || overall < 1 || overall > 5) {
      return { ok: false, error: "Overall rating must be between 1 and 5" };
    }

    const author = String(formData.get("author") ?? "").trim();
    const company = String(formData.get("company") ?? "").trim();
    const quote = String(formData.get("quote") ?? "").trim();
    if (!author || !company || !quote) {
      return { ok: false, error: "Author, company and quote are required" };
    }

    const projectSlug = String(formData.get("projectSlug") ?? "").trim() || null;

    const row = {
      author,
      role: String(formData.get("role") ?? "").trim(),
      company,
      country: String(formData.get("country") ?? "").trim(),
      date: String(formData.get("date") ?? "").trim() || null,
      quote,
      overall,
      categories,
      project_slug: projectSlug,
      updated_at: new Date().toISOString(),
    };

    if (existingId) {
      const { error } = await supabase.from("testimonials").update(row).eq("id", existingId);
      if (error) return { ok: false, error: error.message };
    } else {
      // Forced draft — publishing is a separate, deliberate act.
      const { error } = await supabase.from("testimonials").insert({
        ...row,
        id: id("t"),
        publish: "draft",
        pinned: false,
        featured_on_home: false,
        avatar_slot: "",
        media: [],
      });
      if (error) return { ok: false, error: error.message };
    }

    revalidateReputation(projectSlug ?? undefined);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save" };
  }
}

/** Moderate a testimonial: publish status, pin, feature-on-home (handoff §08). */
export async function moderateTestimonial(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await authorize("marketing.update");
    const testimonialId = String(formData.get("id") ?? "").trim();
    if (!testimonialId) return { ok: false, error: "Missing id" };

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (formData.has("publish")) patch["publish"] = parsePublish(formData.get("publish"));
    if (formData.has("pinned")) patch["pinned"] = formData.get("pinned") === "true";
    if (formData.has("featuredOnHome")) {
      patch["featured_on_home"] = formData.get("featuredOnHome") === "true";
    }

    const { error } = await supabase.from("testimonials").update(patch).eq("id", testimonialId);
    if (error) return { ok: false, error: error.message };

    if (patch["publish"]) {
      await emitEvent({ name: "review.moderate", props: { status: String(patch["publish"]) } });
    }
    revalidateReputation();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to moderate" };
  }
}

export async function deleteTestimonial(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await authorize("marketing.delete");
    const testimonialId = String(formData.get("id") ?? "").trim();
    const { error } = await supabase.from("testimonials").delete().eq("id", testimonialId);
    if (error) return { ok: false, error: error.message };
    revalidateReputation();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete" };
  }
}

/* =============================================================================
 * PORTFOLIO PROJECTS
 * ========================================================================== */

/** Read a repeated checkbox group into a validated string[]. */
function multi(formData: FormData, field: string, vocab: readonly string[]): string[] {
  return formData
    .getAll(field)
    .map(String)
    .filter((v) => vocab.includes(v));
}

/**
 * Create or update a portfolio project (handoff §08 · validation §09.2).
 *
 * INTEGRITY:
 *   * new projects are forced to `draft` — publishing is a separate deliberate
 *     act via the status select, never a side-effect of saving;
 *   * `metrics` is NOT settable here. It has its own action with its own guard,
 *     so a case study cannot acquire result numbers as a side-effect of an edit;
 *   * `permissionLivePreview` requires a valid absolute liveUrl — the DB CHECK
 *     enforces the same pairing, so a permissioned row cannot carry an empty URL.
 */
export async function saveProject(formData: FormData): Promise<ActionResult & { slug?: string }> {
  try {
    const { supabase } = await authorize("marketing.update");

    const existingId = String(formData.get("id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, error: "Name is required" };

    // Auto-suggest from name when left blank (§09.2).
    const rawSlug = String(formData.get("slug") ?? "").trim();
    const slug = rawSlug ? slugify(rawSlug) : slugify(name);
    if (!slug || !isValidSlug(slug)) {
      return { ok: false, error: "Slug must be kebab-case (letters, numbers and hyphens)" };
    }

    const client = String(formData.get("client") ?? "").trim();
    if (!client) return { ok: false, error: "Client is required" };

    const liveUrl = String(formData.get("liveUrl") ?? "").trim();
    const permissionLivePreview = formData.get("permissionLivePreview") === "on";

    // §09.2: liveUrl must be a valid URL when permissionLivePreview is on.
    if (permissionLivePreview) {
      if (!liveUrl) {
        return { ok: false, error: "A live URL is required when live preview is permitted" };
      }
      try {
        const u = new URL(liveUrl);
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad protocol");
      } catch {
        return { ok: false, error: "Live URL must be a valid http(s) URL" };
      }
    }

    const year = Number(formData.get("year"));
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return { ok: false, error: "Year must be a valid year" };
    }

    const deliverablesCount = Number(formData.get("deliverablesCount") ?? 0);
    if (!Number.isFinite(deliverablesCount) || deliverablesCount < 0) {
      return { ok: false, error: "Deliverables count must be 0 or more" };
    }

    const tags = String(formData.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);

    const completedDate = String(formData.get("completedDate") ?? "").trim() || null;

    const row = {
      slug,
      name,
      client,
      industry: String(formData.get("industry") ?? "").trim(),
      size: String(formData.get("size") ?? "").trim(),
      country: String(formData.get("country") ?? "").trim(),
      year,
      services: multi(formData, "services", FACETS.service),
      budget: String(formData.get("budget") ?? "").trim(),
      tech: multi(formData, "tech", FACETS.tech),
      platform: String(formData.get("platform") ?? "").trim(),
      timeline: String(formData.get("timeline") ?? "").trim(),
      deliverables_count: deliverablesCount,
      completed_date: completedDate,
      project_status: String(formData.get("projectStatus") ?? "").trim(),
      live_url: permissionLivePreview ? liveUrl : "",
      permission_live_preview: permissionLivePreview,
      tags,
      summary: String(formData.get("summary") ?? "").trim(),
      challenge: String(formData.get("challenge") ?? "").trim(),
      approach: String(formData.get("approach") ?? "").trim(),
      testimonial_id: String(formData.get("testimonialId") ?? "").trim() || null,
      seo: {
        title: String(formData.get("seoTitle") ?? "").trim(),
        description: String(formData.get("seoDescription") ?? "").trim(),
        ogImage: String(formData.get("ogImage") ?? "").trim(),
      },
      updated_at: new Date().toISOString(),
    };

    if (existingId) {
      const { error } = await supabase
        .from("portfolio_projects")
        .update(row)
        .eq("id", existingId);
      if (error) return { ok: false, error: friendlyDbError(error.message) };
    } else {
      const { error } = await supabase.from("portfolio_projects").insert({
        ...row,
        id: id("p"),
        // Forced draft. Publishing is a deliberate, separate act.
        publish: "draft",
        featured_on_home: false,
        awards: [],
        hero_slot: "",
        gallery_slots: [],
        media: [],
        // Undisclosed by default — result numbers have their own guarded action.
        metrics: { disclosed: false },
        order: 0,
      });
      if (error) return { ok: false, error: friendlyDbError(error.message) };
    }

    revalidateReputation(slug);
    return { ok: true, slug };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save" };
  }
}

/** Turn Postgres constraint noise into something an owner can act on. */
function friendlyDbError(message: string): string {
  if (/portfolio_projects_slug_key|duplicate key/i.test(message)) {
    return "That slug is already used by another project. Slugs must be unique.";
  }
  if (/portfolio_projects_live_preview_needs_url/i.test(message)) {
    return "Live preview is permitted but no URL was supplied.";
  }
  if (/portfolio_projects_slug_kebab/i.test(message)) {
    return "Slug must be kebab-case (letters, numbers and hyphens).";
  }
  return message;
}

export async function deleteProject(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await authorize("marketing.delete");
    const projectId = String(formData.get("id") ?? "").trim();
    const { error } = await supabase.from("portfolio_projects").delete().eq("id", projectId);
    if (error) return { ok: false, error: error.message };
    revalidateReputation();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete" };
  }
}

/** Set a project's publish status / featured flag (handoff §08 + §10.3). */
export async function moderateProject(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await authorize("marketing.update");
    const projectId = String(formData.get("id") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    if (!projectId) return { ok: false, error: "Missing id" };

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (formData.has("publish")) patch["publish"] = parsePublish(formData.get("publish"));
    if (formData.has("featuredOnHome")) {
      patch["featured_on_home"] = formData.get("featuredOnHome") === "true";
    }

    const { error } = await supabase.from("portfolio_projects").update(patch).eq("id", projectId);
    if (error) return { ok: false, error: error.message };

    if (patch["publish"]) {
      await emitEvent({ name: "portfolio.publish", props: { status: String(patch["publish"]) } });
    }
    revalidateReputation(slug || undefined);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to moderate" };
  }
}

/**
 * Set a project's result-metric disclosure.
 *
 * ██ THE INTEGRITY RULE, ENFORCED ██
 * Handoff §10.3: "Admins must not be able to publish a fabricated metric — the
 * field is inert unless disclosed + supplied."
 *
 * So: turning disclosure OFF wipes the values rather than merely hiding them.
 * Leaving numbers in the row while flagged undisclosed is how a later bug or a
 * careless toggle republishes figures nobody re-approved. If it isn't disclosed,
 * it isn't stored.
 */
export async function setProjectMetrics(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await authorize("marketing.update");
    const projectId = String(formData.get("id") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    if (!projectId) return { ok: false, error: "Missing id" };

    const disclosed = formData.get("disclosed") === "true";

    if (!disclosed) {
      const { error } = await supabase
        .from("portfolio_projects")
        .update({ metrics: { disclosed: false }, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      if (error) return { ok: false, error: error.message };
      revalidateReputation(slug || undefined);
      return { ok: true };
    }

    const metrics: Record<string, unknown> = { disclosed: true };
    const numeric = ["leadsGenerated", "conversionLift", "revenueGrowth"] as const;
    const textual = ["timeSaved", "seoLift", "automationSavings"] as const;

    for (const key of numeric) {
      const raw = String(formData.get(key) ?? "").trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return { ok: false, error: `${key} must be a number ≥ 0` };
      metrics[key] = n;
    }
    for (const key of textual) {
      const raw = String(formData.get(key) ?? "").trim();
      if (raw) metrics[key] = raw;
    }

    const { error } = await supabase
      .from("portfolio_projects")
      .update({ metrics, updated_at: new Date().toISOString() })
      .eq("id", projectId);
    if (error) return { ok: false, error: error.message };

    revalidateReputation(slug || undefined);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save metrics" };
  }
}
