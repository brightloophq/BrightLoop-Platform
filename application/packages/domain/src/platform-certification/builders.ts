/* =============================================================================
 * Certification builders (Phase E · Sprint E8) — PURE. Immutable constructors.
 * The run is a versioned root; results/issues/exceptions are append-only. No io.
 * ========================================================================== */

import type {
  CertAuditCategory, CertificationException, CertificationIssue, CertificationResult, CertificationRun, CertOutcome,
  CertSeverity,
} from "@brightloop/schema";

export interface BuildCertificationRunInput { id: string; workspaceId: string; clientId: string | null; title: string; requestedByUserId: string; correlationId: string; now: string; }
export function buildCertificationRun(i: BuildCertificationRunInput): CertificationRun {
  return { id: i.id, workspaceId: i.workspaceId, clientId: i.clientId, title: i.title.slice(0, 300), status: "running", outcome: "failed", published: false, score: 0, totalChecks: 0, passedChecks: 0, failedChecks: 0, warningCount: 0, categoriesCovered: 0, requestedByUserId: i.requestedByUserId, durationMs: 0, correlationId: i.correlationId, version: 1, createdAt: i.now, updatedAt: i.now };
}

export function buildCertificationResult(id: string, runId: string, workspaceId: string, clientId: string | null, category: CertAuditCategory, outcome: CertOutcome, checksTotal: number, checksPassed: number, score: number, summary: string, now: string): CertificationResult {
  return { id, runId, workspaceId, clientId, category, outcome, checksTotal, checksPassed, score, summary: summary.slice(0, 2000), createdAt: now };
}

export function buildCertificationIssue(id: string, runId: string, resultId: string | null, workspaceId: string, clientId: string | null, category: CertAuditCategory, severity: CertSeverity, code: string, title: string, detail: string, boundedContext: string, now: string): CertificationIssue {
  return { id, runId, resultId, workspaceId, clientId, category, severity, code: code.slice(0, 120), title: title.slice(0, 300), detail: detail.slice(0, 2000), boundedContext, status: "open", createdAt: now };
}

export function buildCertificationException(id: string, runId: string, workspaceId: string, clientId: string | null, issueCode: string, reason: string, approvedByUserId: string, expiresAt: string | null, now: string): CertificationException {
  return { id, runId, workspaceId, clientId, issueCode: issueCode.slice(0, 120), reason, approvedByUserId, expiresAt, createdAt: now };
}
