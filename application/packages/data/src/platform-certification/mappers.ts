/* =============================================================================
 * Platform Certification — row ↔ domain mappers (Phase E · Sprint E8).
 * ========================================================================== */

import type { CertificationException, CertificationIssue, CertificationResult, CertificationRun } from "@brightloop/schema";

const int = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const nstr = (v: unknown): string | null => (v as string | null) ?? null;
const bool = (v: unknown): boolean => v === true;

export function runRow(r: CertificationRun): Record<string, unknown> {
  return { id: r.id, workspace_id: r.workspaceId, client_id: r.clientId, title: r.title, status: r.status, outcome: r.outcome, published: r.published, score: r.score, total_checks: r.totalChecks, passed_checks: r.passedChecks, failed_checks: r.failedChecks, warning_count: r.warningCount, categories_covered: r.categoriesCovered, requested_by_user_id: r.requestedByUserId, duration_ms: r.durationMs, correlation_id: r.correlationId, version: r.version, created_at: r.createdAt, updated_at: r.updatedAt };
}
export function toRun(r: Record<string, unknown>): CertificationRun {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), title: String(r["title"]), status: r["status"] as CertificationRun["status"], outcome: r["outcome"] as CertificationRun["outcome"], published: bool(r["published"]), score: int(r["score"]), totalChecks: int(r["total_checks"]), passedChecks: int(r["passed_checks"]), failedChecks: int(r["failed_checks"]), warningCount: int(r["warning_count"]), categoriesCovered: int(r["categories_covered"]), requestedByUserId: String(r["requested_by_user_id"]), durationMs: int(r["duration_ms"]), correlationId: String(r["correlation_id"]), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function resultRow(r: CertificationResult): Record<string, unknown> {
  return { id: r.id, run_id: r.runId, workspace_id: r.workspaceId, client_id: r.clientId, category: r.category, outcome: r.outcome, checks_total: r.checksTotal, checks_passed: r.checksPassed, score: r.score, summary: r.summary, created_at: r.createdAt };
}
export function toResult(r: Record<string, unknown>): CertificationResult {
  return { id: String(r["id"]), runId: String(r["run_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), category: r["category"] as CertificationResult["category"], outcome: r["outcome"] as CertificationResult["outcome"], checksTotal: int(r["checks_total"]), checksPassed: int(r["checks_passed"]), score: int(r["score"]), summary: String(r["summary"] ?? ""), createdAt: String(r["created_at"]) };
}

export function issueRow(i: CertificationIssue): Record<string, unknown> {
  return { id: i.id, run_id: i.runId, result_id: i.resultId, workspace_id: i.workspaceId, client_id: i.clientId, category: i.category, severity: i.severity, code: i.code, title: i.title, detail: i.detail, bounded_context: i.boundedContext, status: i.status, created_at: i.createdAt };
}
export function toIssue(r: Record<string, unknown>): CertificationIssue {
  return { id: String(r["id"]), runId: String(r["run_id"]), resultId: nstr(r["result_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), category: r["category"] as CertificationIssue["category"], severity: r["severity"] as CertificationIssue["severity"], code: String(r["code"]), title: String(r["title"]), detail: String(r["detail"] ?? ""), boundedContext: String(r["bounded_context"] ?? ""), status: r["status"] as CertificationIssue["status"], createdAt: String(r["created_at"]) };
}

export function exceptionRow(e: CertificationException): Record<string, unknown> {
  return { id: e.id, run_id: e.runId, workspace_id: e.workspaceId, client_id: e.clientId, issue_code: e.issueCode, reason: e.reason, approved_by_user_id: e.approvedByUserId, expires_at: e.expiresAt, created_at: e.createdAt };
}
export function toException(r: Record<string, unknown>): CertificationException {
  return { id: String(r["id"]), runId: String(r["run_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), issueCode: String(r["issue_code"]), reason: String(r["reason"] ?? ""), approvedByUserId: String(r["approved_by_user_id"]), expiresAt: nstr(r["expires_at"]), createdAt: String(r["created_at"]) };
}
