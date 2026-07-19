/* =============================================================================
 * Phase 1 — Business Scan / Activation / Console contracts.
 *
 * Canonical spec: docs/design/source/01-Business-Scan.pdf, 02-Activation.pdf,
 * 03-Command-Center.pdf. A client's business is a SYSTEM of seven fixed DOMAINS
 * (Auxion DNA §02/§03). A Business Scan diagnoses each domain against benchmarks
 * (baseline Index); Activation brings domains Operating (Index climbs); the
 * Console reads the live System state.
 *
 * Contracts only — no services, repositories, migrations, or I/O. Statuses are
 * plain enums here (not yet MACHINES-backed); promoting scan/domain lifecycles to
 * the guarded state-machine + DB trigger pattern is a tracked follow-up.
 * Additive: nothing existing is modified.
 * ========================================================================== */

import { z } from "zod";
import { idSchema, timestampSchema } from "./entities.js";

/* ---- the seven canonical domains (fixed taxonomy) ------------------------- */

export const DOMAIN_KEYS = [
  "web",
  "sales",
  "crm",
  "operations",
  "delivery",
  "analytics",
  "ai",
] as const;
export const domainKeySchema = z.enum(DOMAIN_KEYS);
export type DomainKey = z.infer<typeof domainKeySchema>;

/** Display metadata for each domain — the System Map node labels/codes. */
export const DOMAIN_META: Record<DomainKey, { code: string; label: string }> = {
  web: { code: "WEB", label: "Digital" },
  sales: { code: "SAL", label: "Sales" },
  crm: { code: "CRM", label: "CRM" },
  operations: { code: "OPS", label: "Operations" },
  delivery: { code: "DEL", label: "Delivery" },
  analytics: { code: "ANL", label: "Analytics" },
  ai: { code: "AI", label: "AI Layer" },
};

/* ---- Domain (a node in the client's System Map) --------------------------- */

/** A domain's live state: unlit (not_operating) → assembling → lit (operating). */
export const domainStatusSchema = z.enum(["not_operating", "assembling", "operating"]);
export type DomainStatus = z.infer<typeof domainStatusSchema>;

export const domainSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  key: domainKeySchema,
  status: domainStatusSchema,
  /** 0–100 baseline (from the scan) and current score; null until measured. */
  baselineScore: z.number().min(0).max(100).nullable(),
  currentScore: z.number().min(0).max(100).nullable(),
  createdAt: timestampSchema,
});
export type Domain = z.infer<typeof domainSchema>;

/* ---- Business Scan (Diagnose stage — PDF 01) ------------------------------ */

export const scanStatusSchema = z.enum(["diagnosing", "diagnosed", "activating", "operating"]);
export type ScanStatus = z.infer<typeof scanStatusSchema>;

export const businessScanSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  status: scanStatusSchema,
  /** The composite baseline Index (0–100) and the target the System is climbing to. */
  baselineIndex: z.number().min(0).max(100),
  targetIndex: z.number().min(0).max(100),
  createdBy: idSchema.nullable(),
  createdAt: timestampSchema,
});
export type BusinessScan = z.infer<typeof businessScanSchema>;

/** Human/system-entered input to open a scan (Auxiliary engine deferred). */
export const businessScanCreateInputSchema = z.object({
  clientId: idSchema.min(1, "Select an organization"),
  targetIndex: z.number().min(0).max(100).default(92),
});
export type BusinessScanCreateInput = z.infer<typeof businessScanCreateInputSchema>;

/* ---- Scan Finding (per-domain diagnosis ledger row — PDF 01) -------------- */

export const findingPrioritySchema = z.enum(["low", "medium", "high"]);
export type FindingPriority = z.infer<typeof findingPrioritySchema>;

export const scanFindingSchema = z.object({
  id: idSchema,
  scanId: idSchema,
  clientId: idSchema,
  domainKey: domainKeySchema,
  finding: z.string(),
  baseline: z.string().nullable(),
  priority: findingPrioritySchema,
  createdAt: timestampSchema,
});
export type ScanFinding = z.infer<typeof scanFindingSchema>;

export const scanFindingCreateInputSchema = z.object({
  scanId: idSchema.min(1),
  clientId: idSchema.min(1),
  domainKey: domainKeySchema,
  finding: z.string().trim().min(1, "A finding is required").max(500),
  baseline: z.string().trim().max(120).optional().transform((v) => (v && v.length > 0 ? v : null)),
  priority: findingPrioritySchema.default("medium"),
});
export type ScanFindingCreateInput = z.infer<typeof scanFindingCreateInputSchema>;

/* ---- registry (parity with the other entity registries) ------------------- */

export const CORE_SURFACE_ENTITY_SCHEMAS = {
  Domain: domainSchema,
  BusinessScan: businessScanSchema,
  ScanFinding: scanFindingSchema,
} as const satisfies Record<string, z.ZodTypeAny>;

export type CoreSurfaceEntityName = keyof typeof CORE_SURFACE_ENTITY_SCHEMAS;
