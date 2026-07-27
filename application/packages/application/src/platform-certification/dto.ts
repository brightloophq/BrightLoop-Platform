/* =============================================================================
 * Platform Certification DTOs (Phase E · Sprint E8) — the outward boundary.
 * ========================================================================== */

import type { CertificationException, CertificationIssue, CertificationResult, CertificationRun } from "@brightloop/schema";
import type { AuditReport } from "@brightloop/domain";

export interface CertificationRunDTO {
  id: string; title: string; status: CertificationRun["status"]; outcome: CertificationRun["outcome"]; published: boolean;
  score: number; totalChecks: number; passedChecks: number; failedChecks: number; warningCount: number; categoriesCovered: number;
  durationMs: number; correlationId: string; version: number; createdAt: string; updatedAt: string;
}
export const toCertificationRunDTO = (r: CertificationRun): CertificationRunDTO => ({ id: r.id, title: r.title, status: r.status, outcome: r.outcome, published: r.published, score: r.score, totalChecks: r.totalChecks, passedChecks: r.passedChecks, failedChecks: r.failedChecks, warningCount: r.warningCount, categoriesCovered: r.categoriesCovered, durationMs: r.durationMs, correlationId: r.correlationId, version: r.version, createdAt: r.createdAt, updatedAt: r.updatedAt });

export interface CertificationResultDTO { id: string; category: CertificationResult["category"]; outcome: CertificationResult["outcome"]; checksTotal: number; checksPassed: number; score: number; summary: string; }
export const toCertificationResultDTO = (r: CertificationResult): CertificationResultDTO => ({ id: r.id, category: r.category, outcome: r.outcome, checksTotal: r.checksTotal, checksPassed: r.checksPassed, score: r.score, summary: r.summary });

export interface CertificationIssueDTO { id: string; category: CertificationIssue["category"]; severity: CertificationIssue["severity"]; code: string; title: string; detail: string; boundedContext: string; status: CertificationIssue["status"]; }
export const toCertificationIssueDTO = (i: CertificationIssue): CertificationIssueDTO => ({ id: i.id, category: i.category, severity: i.severity, code: i.code, title: i.title, detail: i.detail, boundedContext: i.boundedContext, status: i.status });

export interface CertificationExceptionDTO { id: string; issueCode: string; reason: string; approvedByUserId: string; expiresAt: string | null; createdAt: string; }
export const toCertificationExceptionDTO = (e: CertificationException): CertificationExceptionDTO => ({ id: e.id, issueCode: e.issueCode, reason: e.reason, approvedByUserId: e.approvedByUserId, expiresAt: e.expiresAt, createdAt: e.createdAt });

/** A single audit's report (deterministic, not necessarily persisted). */
export interface AuditReportDTO { category: string; outcome: string; total: number; passed: number; score: number; issues: { code: string; severity: string; title: string; detail: string; boundedContext: string }[]; }
export const toAuditReportDTO = (r: AuditReport): AuditReportDTO => ({ category: r.category, outcome: r.outcome, total: r.total, passed: r.passed, score: r.score, issues: r.issues.map((i) => ({ code: i.code, severity: i.severity, title: i.title, detail: i.detail, boundedContext: i.boundedContext })) });

/** The complete certification report for a run. */
export interface CertificationReportDTO {
  run: CertificationRunDTO;
  results: CertificationResultDTO[];
  issues: CertificationIssueDTO[];
  exceptions: CertificationExceptionDTO[];
}

export interface CertificationDashboardDTO { run: CertificationRunDTO | null; totalRuns: number; lastOutcome: string | null; openIssues: number; }
export interface ProductionReadinessDTO { ready: boolean; score: number; outcome: string; criticalIssues: number; highIssues: number; categoriesPassed: number; categoriesTotal: number; }
