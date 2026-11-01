"use server";

/* Business Scan server actions (Phase 1C) — the ONLY write path. Authenticate →
 * capability → validate (shared Zod) → CoreSurfaceService → revalidate. The
 * browser never writes to Supabase directly. */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { businessScanCreateInputSchema, scanFindingCreateInputSchema } from "@brightloop/schema";
import { assertCapability, AuthorizationError } from "@brightloop/domain";
import { getActor } from "@/lib/auth";
import { getScanAssessment, listScans } from "@brightloop/application";
import { readBaselineScores } from "@/lib/baseline-scores";
import { importedDiagnosis, reconcileLedger } from "@/lib/diagnosis-import";
import { buildAppContext } from "@/lib/runtime-api";
import { getCoreSurfaceRepository, getCoreSurfaceService } from "@/lib/repositories";

const SCAN_WRITE = "transformation.scan.write";

export interface ActionResult {
  ok: boolean;
  id?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function flatten(issues: { path: (string | number)[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

/** Open a Business Scan (Diagnose) for an organization. Domains start unlit. */
export async function startScanAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "You are not signed in." };
    assertCapability(actor, SCAN_WRITE);

    const parsed = businessScanCreateInputSchema.safeParse({
      clientId: String(formData.get("clientId") ?? "").trim(),
      targetIndex: Number(formData.get("targetIndex") ?? 92),
    });
    if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: flatten(parsed.error.issues) };

    const svc = await getCoreSurfaceService();
    // Idempotent: reuses an existing scan and seeds the seven domains exactly once.
    const scan = await svc.startDiagnosis(actor, { clientId: parsed.data.clientId, targetIndex: parsed.data.targetIndex });
    revalidatePath("/admin/business-scan");
    revalidatePath("/admin/activation");
    revalidatePath("/admin/dashboard");
    return { ok: true, id: scan.id };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to run a scan." };
    // Surface the real typed failure — never a silent success. The adapter throws
    // `core-surfaces.<op> failed: <db message>`; show it so the UI is honest.
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't start the scan." };
  }
}

/** Record a per-domain diagnosis finding. */
export async function addFindingAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "You are not signed in." };
    assertCapability(actor, SCAN_WRITE);

    const parsed = scanFindingCreateInputSchema.safeParse({
      scanId: String(formData.get("scanId") ?? ""),
      clientId: String(formData.get("clientId") ?? ""),
      domainKey: String(formData.get("domainKey") ?? ""),
      finding: String(formData.get("finding") ?? ""),
      baseline: String(formData.get("baseline") ?? ""),
      priority: String(formData.get("priority") ?? "medium"),
    });
    if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: flatten(parsed.error.issues) };

    const svc = await getCoreSurfaceService();
    await svc.addFinding(actor, parsed.data);
    revalidatePath("/admin/business-scan");
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to add findings." };
    // Surface the typed failure, exactly as startScanAction does. This used to
    // discard `e.message` and return a fixed sentence, so a real database error
    // arrived as an unexplained refusal.
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't add the finding." };
  }
}

/* Server-rendered <form action> wrappers.
 * Start Diagnosis redirects back with the real error in ?scanError= on failure —
 * never a silent success — and to the clean workspace URL on success. */
export async function startScanForm(formData: FormData): Promise<void> {
  const result = await startScanAction(formData);
  const clientId = String(formData.get("clientId") ?? "");
  const base = `/admin/business-scan?client=${encodeURIComponent(clientId)}`;
  redirect(result.ok ? base : `${base}&scanError=${encodeURIComponent(result.error ?? "Couldn't start the scan.")}`);
}
/**
 * Add Finding — the same contract as Start Diagnosis above.
 *
 * This used to `await addFindingAction(formData)` and DISCARD the result. A
 * refused write, a validation failure and a successful one were indistinguish-
 * able: the page re-rendered, the finding was simply not in the ledger, and
 * nothing anywhere said why. The redirect carries the real reason back instead,
 * matching the `?scanError=` pattern its sibling already used.
 */
export async function addFindingForm(formData: FormData): Promise<void> {
  const result = await addFindingAction(formData);
  const clientId = String(formData.get("clientId") ?? "");
  const base = `/admin/business-scan?client=${encodeURIComponent(clientId)}`;
  redirect(result.ok ? base : `${base}&findingError=${encodeURIComponent(result.error ?? "Couldn't add the finding.")}`);
}

/**
 * Remove one diagnosis finding.
 *
 * The ledger had no way to delete a row at all. That mattered most for rows the
 * old append-only import left behind: they predate the manual/import
 * distinction, so they are recorded as `manual` and a re-import will not retire
 * them — correctly, since nothing can now prove they were not typed by a person.
 * This is how they go.
 */
export async function removeFindingAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "You are not signed in." };
    assertCapability(actor, SCAN_WRITE);

    const findingId = String(formData.get("findingId") ?? "").trim();
    if (!findingId) return { ok: false, error: "Missing the finding." };

    const svc = await getCoreSurfaceService();
    // `false` means nothing was deleted — a row already gone, or one RLS
    // refused. Reported, never rendered as a success.
    if (!(await svc.removeFinding(actor, findingId))) {
      return { ok: false, error: "That finding was already gone, or you don't have access to it." };
    }

    revalidatePath("/admin/business-scan");
    revalidatePath("/admin/activation");
    revalidatePath("/admin/dashboard");
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to remove findings." };
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't remove the finding." };
  }
}

/** Form wrapper — carries the reason back, never a silent no-op. */
export async function removeFindingForm(formData: FormData): Promise<void> {
  const result = await removeFindingAction(formData);
  const clientId = String(formData.get("clientId") ?? "");
  const base = `/admin/business-scan?client=${encodeURIComponent(clientId)}`;
  redirect(result.ok ? base : `${base}&findingError=${encodeURIComponent(result.error ?? "Couldn't remove the finding.")}`);
}

/* ---- Baseline scoring ------------------------------------------------------
 * Diagnosis produces a NUMBER, and until now nothing in the product could set
 * one. `upsertDomain` has always accepted `baselineScore`, the System Map and
 * the Index gauge have always read it, and no screen ever wrote it — so the
 * seven nodes stayed unlit and the Baseline Index stayed 0 no matter what you
 * did. "Start diagnosis" appeared to do nothing because the instrument it feeds
 * had no input.
 * ------------------------------------------------------------------------- */

/** Score the seven domains 0–100. A blank field leaves that domain untouched. */
export async function setBaselinesAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "You are not signed in." };
    assertCapability(actor, SCAN_WRITE);

    const clientId = String(formData.get("clientId") ?? "").trim();
    if (!clientId) return { ok: false, error: "Missing the organization." };

    // Blank means "not scored yet", never zero — see baseline-scores.ts.
    const parsed = readBaselineScores(formData);
    if ("error" in parsed) return { ok: false, error: parsed.error };
    if (parsed.scores.length === 0) {
      return { ok: false, error: "Nothing to save — enter a score for at least one domain." };
    }

    const svc = await getCoreSurfaceService();
    for (const { key, score } of parsed.scores) {
      await svc.upsertDomain(actor, { clientId, key, baselineScore: score });
    }

    revalidatePath("/admin/business-scan");
    revalidatePath("/admin/activation");
    revalidatePath("/admin/dashboard");
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to score domains." };
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the baseline scores." };
  }
}

/** Form wrapper — carries the reason back, never a silent no-op. */
export async function setBaselinesForm(formData: FormData): Promise<void> {
  const result = await setBaselinesAction(formData);
  const clientId = String(formData.get("clientId") ?? "");
  const base = `/admin/business-scan?client=${encodeURIComponent(clientId)}`;
  redirect(result.ok ? base : `${base}&baselineError=${encodeURIComponent(result.error ?? "Couldn't save the baseline scores.")}`);
}

/* ---- Import a diagnosis from a completed prospect scan ---------------------
 * The Business Scan asks you to score seven domains by hand. The Prospect
 * Scanner already computes a Business Health Index from a crawl of the real
 * website. This carries one into the other.
 *
 * It does NOT run a scan. Stage execution stays in the Prospect Scanner, one
 * stage per click behind its kill switches, because every stage can spend
 * provider budget — putting a whole pipeline behind a button labelled "Start
 * diagnosis" would spend money on a mis-click. This reads a scan that has
 * ALREADY been run and completed, and costs nothing.
 * ------------------------------------------------------------------------- */

/** Copy a completed scan's assessment into this client's baseline + findings. */
export async function importDiagnosisAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "You are not signed in." };
    assertCapability(actor, SCAN_WRITE);

    const clientId = String(formData.get("clientId") ?? "").trim();
    const runId = String(formData.get("runId") ?? "").trim();
    if (!clientId || !runId) return { ok: false, error: "Missing the organization or the scan." };

    const ctx = await buildAppContext();
    if (ctx === null) return { ok: false, error: "You are not signed in." };

    // The run must belong to THIS client. `getScanAssessment` authorizes the
    // run on its own terms, which is not the same question: without this check
    // a run id put into the form could pull another client's diagnosis onto
    // this one's System Map.
    const runs = await listScans(ctx, { clientId, limit: 100 });
    const run = runs.find((r) => r.id === runId);
    if (!run) return { ok: false, error: "That scan does not belong to this organization." };

    const assessment = await getScanAssessment(ctx, runId);
    if (!assessment.present || assessment.report === null) {
      return {
        ok: false,
        error: "That scan has not produced an assessment yet. Advance its stages in the Prospect Scanner first.",
      };
    }

    // The artifacts as the pipeline actually persists them: the report carries
    // `domainSummaries` keyed by maturity category plus a `risks` section, and
    // the sibling `findings` artifact carries the category each weakness belongs
    // to. Reading the wrong keys here is what made every import come back empty.
    const { scores, findings, summariesSeen } = importedDiagnosis({
      report: assessment.report.content,
      findings: assessment.findings?.content ?? null,
    });

    if (scores.length === 0 && findings.length === 0) {
      return {
        ok: false,
        error:
          summariesSeen === 0
            ? "That scan produced no scored categories and no findings — its crawl may have reached nothing. Open it in the Prospect Scanner and check the pages it fetched."
            : "That assessment carried nothing this map can use — none of its scored categories names a System Map domain.",
      };
    }

    const svc = await getCoreSurfaceService();
    // Idempotent: reuses the existing scan and seeds any missing domains.
    const scan = await svc.startDiagnosis(actor, { clientId });

    for (const { key, score } of scores) {
      await svc.upsertDomain(actor, { clientId, key, baselineScore: score });
    }

    // The ledger is REPLACED, not appended to: a newer scan retires the rows the
    // previous import wrote and no longer reports. Findings typed by a person
    // are never touched — see reconcileLedger.
    const repo = await getCoreSurfaceRepository();
    const plan = reconcileLedger(await repo.listFindings(scan.id), findings);

    // Add BEFORE retiring. If this run is interrupted the ledger briefly holds
    // both, which is visibly wrong and self-corrects on the next import; the
    // other order would leave it empty with nothing to say why.
    let added = 0;
    for (const finding of plan.add) {
      await svc.addFinding(actor, {
        scanId: scan.id,
        clientId,
        domainKey: finding.domainKey,
        finding: finding.finding,
        baseline: finding.baseline ?? undefined,
        priority: finding.priority,
        source: "import",
        sourceRunId: runId,
      });
      added += 1;
    }

    let retired = 0;
    for (const id of plan.remove) {
      if (await svc.removeFinding(actor, id)) retired += 1;
    }

    revalidatePath("/admin/business-scan");
    revalidatePath("/admin/activation");
    revalidatePath("/admin/dashboard");
    const summary = [
      `${scores.length} domains scored`,
      `${added} findings added`,
      retired > 0 ? `${retired} retired` : null,
      plan.keep > 0 ? `${plan.keep} kept` : null,
    ].filter(Boolean).join(", ");
    return { ok: true, id: summary };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to import a diagnosis." };
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't import the diagnosis." };
  }
}

/** Form wrapper — reports what landed, or why nothing did. */
export async function importDiagnosisForm(formData: FormData): Promise<void> {
  const result = await importDiagnosisAction(formData);
  const clientId = String(formData.get("clientId") ?? "");
  const base = `/admin/business-scan?client=${encodeURIComponent(clientId)}`;
  redirect(
    result.ok
      ? `${base}&imported=${encodeURIComponent(result.id ?? "")}`
      : `${base}&importError=${encodeURIComponent(result.error ?? "Couldn't import the diagnosis.")}`,
  );
}
