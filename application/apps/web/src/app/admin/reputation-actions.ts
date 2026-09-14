"use server";

import { revalidatePath } from "next/cache";
import { FACETS, PUBLISH_STATES, RATING_CATEGORIES, type PublishStatus } from "@brightloop/schema";
import { assertCapability } from "@brightloop/domain";
import { getActor } from "@/lib/auth";
import { emitEvent } from "@/lib/analytics";
import {
  ACCEPTED_UPLOAD_LABEL,
  MAX_UPLOAD_BYTES,
  mediaObjectPath,
  tooLargeMessage,
  uploadExtension,
} from "@/lib/media-upload";
import { readProjectMedia } from "@/lib/project-media";
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

    // See moderateProject: an update matching no row is otherwise silent.
    const { data, error } = await supabase
      .from("testimonials")
      .update(patch)
      .eq("id", testimonialId)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) {
      return {
        ok: false,
        error: "That review was not updated — it may have been deleted. Reload the page and check.",
      };
    }

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
    if (!testimonialId) return { ok: false, error: "No review was selected." };

    // `.select()` makes the delete REPORT what it removed. Without it Supabase
    // returns error: null for a delete that matched nothing — a stale id, a row
    // already gone, or one hidden by RLS all look exactly like success, so the
    // UI said nothing and the list re-rendered unchanged.
    const { data, error } = await supabase
      .from("testimonials")
      .delete()
      .eq("id", testimonialId)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) {
      return {
        ok: false,
        error: "That review was not deleted — it may already be gone. Reload the page and check.",
      };
    }

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
export type UploadTicket =
  | { ok: true; path: string; token: string; publicUrl: string }
  | { ok: false; error: string };

/**
 * Issue a one-time signed URL for uploading a portfolio image.
 *
 * THE FILE DOES NOT COME THROUGH HERE, and that is the whole point. An earlier
 * revision took the File in a server action and uploaded it server-side; every
 * real photograph failed, because a Next.js server action caps its request body
 * at 1 MB by default and Vercel caps a serverless request at 4.5 MB. The browser
 * now PUTs the bytes straight to Supabase Storage with the token returned here.
 *
 * The authorization story is unchanged, and is two-layered exactly as before:
 *   1. `authorize("marketing.update")` refuses a team_member outright;
 *   2. `createSignedUploadUrl` runs on the SESSION client, so the bucket's own
 *      insert policy (owner/admin — storage migration 0006) must also pass. A
 *      token is only ever minted for someone the DATABASE agrees may write.
 * The token is scoped to the single path we choose here, so it cannot be
 * replayed against any other object.
 *
 * Size and type are checked here to fail fast with a readable message, and
 * enforced for real by the bucket's own file_size_limit / allowed_mime_types
 * (migration 20260812000100) — the only place that still sees the bytes.
 */
export async function createProjectImageUpload(formData: FormData): Promise<UploadTicket> {
  try {
    const { supabase } = await authorize("marketing.update");

    const filename = String(formData.get("filename") ?? "").trim();
    const mime = String(formData.get("mime") ?? "").trim();
    const size = Number(formData.get("size") ?? 0);

    if (!filename) return { ok: false, error: "Choose an image file first." };
    if (Number.isFinite(size) && size > MAX_UPLOAD_BYTES) {
      return { ok: false, error: tooLargeMessage(size) };
    }

    const extension = uploadExtension(mime, filename);
    if (!extension) {
      return {
        ok: false,
        error: `That file type can't be used as a project image. Use ${ACCEPTED_UPLOAD_LABEL}.`,
      };
    }

    const path = mediaObjectPath(id("m"), extension);
    const { data, error } = await supabase.storage.from("media").createSignedUploadUrl(path);
    if (error) return { ok: false, error: error.message };
    if (!data?.token) return { ok: false, error: "Supabase returned no upload token." };

    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
    if (!pub?.publicUrl) {
      return { ok: false, error: "Supabase returned no public URL for that path." };
    }

    return { ok: true, path, token: data.token, publicUrl: pub.publicUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start the upload" };
  }
}

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

    const mediaResult = readProjectMedia(formData);
    if ("error" in mediaResult) return { ok: false, error: mediaResult.error };

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
      media: mediaResult.media,
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
    if (!projectId) return { ok: false, error: "No project was selected." };

    // See deleteTestimonial: without .select() a no-op delete is indistinguishable
    // from a successful one.
    const { data, error } = await supabase
      .from("portfolio_projects")
      .delete()
      .eq("id", projectId)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) {
      return {
        ok: false,
        error: "That project was not deleted — it may already be gone. Reload the page and check.",
      };
    }

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

    // `.select()` makes the update REPORT what it changed. Without it Supabase
    // returns error: null for an update that matched nothing, so "make this
    // public" could do exactly nothing and still look like it worked — which is
    // precisely how a case study stays invisible with no explanation.
    const { data, error } = await supabase
      .from("portfolio_projects")
      .update(patch)
      .eq("id", projectId)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) {
      return {
        ok: false,
        error: "That project was not updated — it may have been deleted. Reload the page and check.",
      };
    }

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
