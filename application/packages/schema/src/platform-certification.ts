/* =============================================================================
 * Platform Certification & Production Readiness (Phase E · Sprint E8) — schema.
 *
 * This context introduces NO new business capability. It CERTIFIES that every
 * bounded context (Phase D + E1–E7) meets production-quality standards —
 * architecture, security, authorization, RLS, reliability, observability,
 * recoverability, determinism — and records the outcome. Additive; a new
 * `platform-certification` bounded context.
 * ========================================================================== */

import { z } from "zod";

/* ---- enums ----------------------------------------------------------------- */

/** The audit dimensions a certification run covers. */
export const certAuditCategorySchema = z.enum([
  "architecture", "capability", "boundary", "authorization", "rls", "approval", "idempotency", "checkpoint",
  "recovery", "performance", "security", "observability", "database", "api_contract", "read_model", "audit_trail",
]);
export type CertAuditCategory = z.infer<typeof certAuditCategorySchema>;

export const certSeveritySchema = z.enum(["info", "low", "medium", "high", "critical"]);
export type CertSeverity = z.infer<typeof certSeveritySchema>;

/** Pass / pass-with-warnings / fail for a result or the whole run. */
export const certOutcomeSchema = z.enum(["passed", "passed_with_warnings", "failed"]);
export type CertOutcome = z.infer<typeof certOutcomeSchema>;

export const certRunStatusSchema = z.enum(["running", "completed", "failed"]);
export type CertRunStatus = z.infer<typeof certRunStatusSchema>;

export const certIssueStatusSchema = z.enum(["open", "waived", "resolved"]);
export type CertIssueStatus = z.infer<typeof certIssueStatusSchema>;

/* ---- certification run (versioned root) ------------------------------------ */

export const certificationRunSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  title: z.string().min(1).max(300),
  status: certRunStatusSchema.default("running"),
  outcome: certOutcomeSchema.default("failed"),
  published: z.boolean().default(false),
  score: z.number().int().min(0).max(100).default(0),
  totalChecks: z.number().int().min(0).default(0),
  passedChecks: z.number().int().min(0).default(0),
  failedChecks: z.number().int().min(0).default(0),
  warningCount: z.number().int().min(0).default(0),
  categoriesCovered: z.number().int().min(0).default(0),
  requestedByUserId: z.string(),
  durationMs: z.number().int().min(0).default(0),
  correlationId: z.string(),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CertificationRun = z.infer<typeof certificationRunSchema>;

/* ---- certification result (append-only; one per audited category) ---------- */

export const certificationResultSchema = z.object({
  id: z.string(),
  runId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  category: certAuditCategorySchema,
  outcome: certOutcomeSchema,
  checksTotal: z.number().int().min(0).default(0),
  checksPassed: z.number().int().min(0).default(0),
  score: z.number().int().min(0).max(100).default(0),
  summary: z.string().default(""),
  createdAt: z.string(),
});
export type CertificationResult = z.infer<typeof certificationResultSchema>;

/* ---- certification issue (append-only) ------------------------------------- */

export const certificationIssueSchema = z.object({
  id: z.string(),
  runId: z.string(),
  resultId: z.string().nullable().default(null),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  category: certAuditCategorySchema,
  severity: certSeveritySchema,
  code: z.string().min(1).max(120),
  title: z.string().min(1).max(300),
  detail: z.string().default(""),
  boundedContext: z.string().default(""),
  status: certIssueStatusSchema.default("open"),
  createdAt: z.string(),
});
export type CertificationIssue = z.infer<typeof certificationIssueSchema>;

/* ---- certification exception (append-only; a documented waiver) ------------ */

export const certificationExceptionSchema = z.object({
  id: z.string(),
  runId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  issueCode: z.string().min(1).max(120),
  reason: z.string().min(1),
  approvedByUserId: z.string(),
  expiresAt: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type CertificationException = z.infer<typeof certificationExceptionSchema>;
