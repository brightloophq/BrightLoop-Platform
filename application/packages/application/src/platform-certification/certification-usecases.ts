/* =============================================================================
 * Platform Certification use-cases (Phase E · Sprint E8).
 *
 * Runs the deterministic domain audits over the LIVE platform metadata, persists
 * the certification run + per-category results + issues, and exposes report /
 * publish / exception flows. Only owners/admins may execute certification. This
 * context introduces no business capability — it certifies the existing ones.
 * ========================================================================== */

import {
  auditApiContract, auditArchitecture, auditAuditTrail, auditAuthorization, auditBoundary, auditCapabilities,
  auditCheckpointRecovery, auditDatabase, auditIdempotency, auditObservability, auditPerformance, auditReadModel,
  auditRls, auditSecurity, buildCertificationException, buildCertificationIssue, buildCertificationResult,
  buildCertificationRun, runAllAudits, type AuditReport,
} from "@brightloop/domain";
import type { CertificationResult } from "@brightloop/schema";
import {
  authorize, requireCertification, CERTIFICATION_ADMIN_CAP, CERTIFICATION_PUBLISH_CAP, CERTIFICATION_RUN_CAP,
  type AppContext,
} from "../context.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import {
  toAuditReportDTO, toCertificationExceptionDTO, toCertificationRunDTO, type AuditReportDTO,
  type CertificationExceptionDTO, type CertificationRunDTO,
} from "./dto.js";

/* ---- individual audits (owner/admin; deterministic; return the report) ------ */

function runAudit(ctx: AppContext, audit: () => AuditReport): AuditReportDTO {
  authorize(ctx.actor, CERTIFICATION_RUN_CAP, ctx.actor.clientId);
  return toAuditReportDTO(audit());
}
export const runArchitectureAudit = (ctx: AppContext): AuditReportDTO => runAudit(ctx, auditArchitecture);
export const runCapabilityAudit = (ctx: AppContext): AuditReportDTO => runAudit(ctx, auditCapabilities);
export const runAuthorizationAudit = (ctx: AppContext): AuditReportDTO => runAudit(ctx, auditAuthorization);
export const runRlsAudit = (ctx: AppContext): AuditReportDTO => runAudit(ctx, auditRls);
export const runSecurityAudit = (ctx: AppContext): AuditReportDTO => runAudit(ctx, auditSecurity);
export const runObservabilityAudit = (ctx: AppContext): AuditReportDTO => runAudit(ctx, auditObservability);
export const runPerformanceAudit = (ctx: AppContext): AuditReportDTO => runAudit(ctx, auditPerformance);
export const runRecoveryAudit = (ctx: AppContext): AuditReportDTO => runAudit(ctx, auditCheckpointRecovery);
export const runBoundaryAudit = (ctx: AppContext): AuditReportDTO => runAudit(ctx, auditBoundary);
export const runApprovalAudit = (ctx: AppContext): AuditReportDTO => runAudit(ctx, auditAuditTrail);
export const runIdempotencyAudit = (ctx: AppContext): AuditReportDTO => runAudit(ctx, auditIdempotency);
export const runDatabaseAudit = (ctx: AppContext): AuditReportDTO => runAudit(ctx, auditDatabase);
export const runApiContractAudit = (ctx: AppContext): AuditReportDTO => runAudit(ctx, auditApiContract);
export const runReadModelAudit = (ctx: AppContext): AuditReportDTO => runAudit(ctx, auditReadModel);

/* ---- the full platform certification (persisted) --------------------------- */

export interface RunPlatformCertificationInput { title?: string; }

export async function runPlatformCertification(ctx: AppContext, rawWorkspaceId: unknown, input: RunPlatformCertificationInput = {}): Promise<CertificationRunDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const cert = requireCertification(ctx);
  authorize(ctx.actor, CERTIFICATION_RUN_CAP, ctx.actor.clientId);
  const startedAt = ctx.clock();

  const run = buildCertificationRun({ id: ctx.ids("cert"), workspaceId, clientId: ctx.actor.clientId, title: input.title ?? "Platform certification", requestedByUserId: ctx.actor.userId, correlationId: ctx.ids("corr"), now: ctx.clock() });
  unwrap(await cert.runs.create(run));

  const reports = runAllAudits();
  const results: CertificationResult[] = reports.map((r) => buildCertificationResult(ctx.ids("cres"), run.id, workspaceId, run.clientId, r.category, r.outcome, r.total, r.passed, r.score, `${r.passed}/${r.total} checks passed`, ctx.clock()));
  unwrap(await cert.results.appendMany(results));

  const issues = reports.flatMap((r) => r.issues.map((i) => buildCertificationIssue(ctx.ids("ciss"), run.id, null, workspaceId, run.clientId, r.category, i.severity, i.code, i.title, i.detail, i.boundedContext, ctx.clock())));
  if (issues.length > 0) unwrap(await cert.issues.appendMany(issues));

  const totalChecks = reports.reduce((s, r) => s + r.total, 0);
  const passedChecks = reports.reduce((s, r) => s + r.passed, 0);
  const failedChecks = totalChecks - passedChecks;
  const warningCount = issues.filter((i) => i.severity === "low" || i.severity === "medium").length;
  const hardFail = reports.some((r) => r.outcome === "failed");
  const outcome: "passed" | "passed_with_warnings" | "failed" = hardFail ? "failed" : reports.some((r) => r.outcome === "passed_with_warnings") ? "passed_with_warnings" : "passed";
  const score = totalChecks === 0 ? 100 : Math.round((passedChecks / totalChecks) * 100);
  const endedAt = ctx.clock();

  const next = { ...run, status: "completed" as const, outcome, score, totalChecks, passedChecks, failedChecks, warningCount, categoriesCovered: reports.length, durationMs: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)), updatedAt: endedAt, version: run.version + 1 };
  unwrap(await cert.runs.save(next, run.version));
  return toCertificationRunDTO(next);
}

/* ---- report / publish / exceptions ----------------------------------------- */

async function loadRun(ctx: AppContext, runId: string, cap: string) {
  const cert = requireCertification(ctx);
  const run = unwrap(await cert.runs.getById(runId));
  if (run === null) throw new NotFoundError("certification run");
  authorize(ctx.actor, cap, run.clientId);
  return { cert, run };
}

export async function generateCertificationReport(ctx: AppContext, rawRunId: unknown) {
  const runId = requireId(rawRunId, "runId");
  const { cert, run } = await loadRun(ctx, runId, CERTIFICATION_RUN_CAP);
  const [results, issues, exceptions] = await Promise.all([
    cert.results.listByRun(runId).then(unwrap), cert.issues.listByRun(runId).then(unwrap), cert.exceptions.listByRun(runId).then(unwrap),
  ]);
  const { toCertificationResultDTO, toCertificationIssueDTO } = await import("./dto.js");
  return {
    run: toCertificationRunDTO(run),
    results: results.map(toCertificationResultDTO),
    issues: issues.map(toCertificationIssueDTO),
    exceptions: exceptions.map(toCertificationExceptionDTO),
  };
}

/** Publish a certification — only a passing (or warnings-only) run may publish. */
export async function publishCertification(ctx: AppContext, rawRunId: unknown): Promise<CertificationRunDTO> {
  const runId = requireId(rawRunId, "runId");
  const { cert, run } = await loadRun(ctx, runId, CERTIFICATION_PUBLISH_CAP);
  if (run.status !== "completed") throw new ConflictError("Only a completed run can be published");
  if (run.outcome === "failed") throw new ConflictError("A failed certification cannot be published");
  if (run.published) return toCertificationRunDTO(run);
  const next = { ...run, published: true, updatedAt: ctx.clock(), version: run.version + 1 };
  unwrap(await cert.runs.save(next, run.version));
  return toCertificationRunDTO(next);
}

export interface SubmitExceptionInput { issueCode: string; reason: string; expiresAt?: string | null; }
export async function submitCertificationException(ctx: AppContext, rawRunId: unknown, input: SubmitExceptionInput): Promise<CertificationExceptionDTO> {
  const runId = requireId(rawRunId, "runId");
  const reason = requireString(input.reason, "reason").trim();
  if (reason === "") throw new ValidationError("An exception reason is required");
  const { cert, run } = await loadRun(ctx, runId, CERTIFICATION_ADMIN_CAP);
  const ex = buildCertificationException(ctx.ids("cexc"), runId, run.workspaceId, run.clientId, requireString(input.issueCode, "issueCode"), reason, ctx.actor.userId, input.expiresAt ?? null, ctx.clock());
  unwrap(await cert.exceptions.append(ex));
  return toCertificationExceptionDTO(ex);
}
