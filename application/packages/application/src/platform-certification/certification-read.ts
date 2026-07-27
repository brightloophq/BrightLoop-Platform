/* =============================================================================
 * Platform Certification read models (Phase E · Sprint E8).
 *
 * Certification dashboard, run history, per-category reports, and the production-
 * readiness projection. Load-then-authorize; DTOs only.
 * ========================================================================== */

import { authorize, requireCertification, CERTIFICATION_READ_CAP, type AppContext } from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import {
  toCertificationIssueDTO, toCertificationResultDTO, toCertificationRunDTO,
  type CertificationDashboardDTO, type CertificationIssueDTO, type CertificationResultDTO, type CertificationRunDTO,
  type ProductionReadinessDTO,
} from "./dto.js";

export async function listCertificationRuns(ctx: AppContext, rawWorkspaceId: unknown): Promise<CertificationRunDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const cert = requireCertification(ctx);
  authorize(ctx.actor, CERTIFICATION_READ_CAP, ctx.actor.clientId);
  return [...unwrap(await cert.runs.listByWorkspace(workspaceId))].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toCertificationRunDTO);
}

export async function getCertificationDashboard(ctx: AppContext, rawWorkspaceId: unknown): Promise<CertificationDashboardDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const cert = requireCertification(ctx);
  authorize(ctx.actor, CERTIFICATION_READ_CAP, ctx.actor.clientId);
  const runs = [...unwrap(await cert.runs.listByWorkspace(workspaceId))].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const latest = runs[0] ?? null;
  const openIssues = latest ? unwrap(await cert.issues.listByRun(latest.id)).filter((i) => i.status === "open").length : 0;
  return { run: latest ? toCertificationRunDTO(latest) : null, totalRuns: runs.length, lastOutcome: latest?.outcome ?? null, openIssues };
}

async function loadRun(ctx: AppContext, runId: string) {
  const cert = requireCertification(ctx);
  const run = unwrap(await cert.runs.getById(runId));
  if (run === null) throw new NotFoundError("certification run");
  authorize(ctx.actor, CERTIFICATION_READ_CAP, run.clientId);
  return { cert, run };
}

export async function listCertificationResults(ctx: AppContext, rawRunId: unknown): Promise<CertificationResultDTO[]> {
  const runId = requireId(rawRunId, "runId");
  const { cert } = await loadRun(ctx, runId);
  return unwrap(await cert.results.listByRun(runId)).map(toCertificationResultDTO);
}

/** Issues for a run, most severe first. */
export async function listCertificationIssues(ctx: AppContext, rawRunId: unknown): Promise<CertificationIssueDTO[]> {
  const runId = requireId(rawRunId, "runId");
  const { cert } = await loadRun(ctx, runId);
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return [...unwrap(await cert.issues.listByRun(runId))].sort((a, b) => (order[a.severity] ?? 5) - (order[b.severity] ?? 5)).map(toCertificationIssueDTO);
}

/** A single audited category's persisted result. */
export async function getCategoryReport(ctx: AppContext, rawRunId: unknown, category: string): Promise<CertificationResultDTO | null> {
  const runId = requireId(rawRunId, "runId");
  const { cert } = await loadRun(ctx, runId);
  const r = unwrap(await cert.results.listByRun(runId)).find((x) => x.category === category);
  return r ? toCertificationResultDTO(r) : null;
}

/** Production Readiness — the go/no-go projection for a run. */
export async function getProductionReadiness(ctx: AppContext, rawRunId: unknown): Promise<ProductionReadinessDTO> {
  const runId = requireId(rawRunId, "runId");
  const { cert, run } = await loadRun(ctx, runId);
  const [results, issues] = await Promise.all([cert.results.listByRun(runId).then(unwrap), cert.issues.listByRun(runId).then(unwrap)]);
  const criticalIssues = issues.filter((i) => i.severity === "critical" && i.status === "open").length;
  const highIssues = issues.filter((i) => i.severity === "high" && i.status === "open").length;
  const categoriesPassed = results.filter((r) => r.outcome !== "failed").length;
  return { ready: run.outcome !== "failed" && criticalIssues === 0, score: run.score, outcome: run.outcome, criticalIssues, highIssues, categoriesPassed, categoriesTotal: results.length };
}
