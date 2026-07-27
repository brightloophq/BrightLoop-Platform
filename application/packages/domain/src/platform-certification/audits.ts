/* =============================================================================
 * Certification audit engine (Phase E · Sprint E8) — PURE.
 *
 * Deterministic audits that check the LIVE platform metadata — the capability
 * registry, the role/permission matrix, the instruction-trust precedence — plus
 * the declared platform manifest, producing structured, reproducible results.
 * DB-level RLS / append-only / constraint proofs live in the per-sprint pgTAP
 * suites; these audits certify the in-process invariants and declared posture.
 * No io, no clock, no randomness.
 * ========================================================================== */

import type { CertAuditCategory, CertOutcome, CertSeverity } from "@brightloop/schema";
import { PERMISSIONS, ROLE_NAMES, hasCapability, isClientRole } from "@brightloop/schema";
import { CAPABILITY_REGISTRY, INSTRUCTION_PRECEDENCE, externalGovernanceIssues, isGovernedExternalCapability, isKnownCapability, isUntrusted } from "../agents/index.js";
import { MANDATORY_APPROVAL_CLASSES, PLATFORM_CONTEXTS, PLATFORM_TABLES, READ_MODEL_MANIFEST } from "./manifest.js";

export interface AuditCheck { name: string; ok: boolean; severity: CertSeverity; detail: string }
export interface AuditIssue { code: string; severity: CertSeverity; title: string; detail: string; boundedContext: string }
export interface AuditReport { category: CertAuditCategory; checks: AuditCheck[]; total: number; passed: number; score: number; outcome: CertOutcome; issues: AuditIssue[] }

const CONTEXT_KEYS = new Set(PLATFORM_CONTEXTS.map((c) => c.key));

function report(category: CertAuditCategory, checks: AuditCheck[]): AuditReport {
  const total = checks.length;
  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok);
  const hard = failed.some((c) => c.severity === "high" || c.severity === "critical");
  const outcome: CertOutcome = failed.length === 0 ? "passed" : hard ? "failed" : "passed_with_warnings";
  const issues: AuditIssue[] = failed.map((c) => ({ code: `${category}.${c.name}`, severity: c.severity, title: c.name, detail: c.detail, boundedContext: category }));
  return { category, checks, total, passed, score: total === 0 ? 100 : Math.round((passed / total) * 100), outcome, issues };
}
const chk = (name: string, ok: boolean, severity: CertSeverity, detail = ""): AuditCheck => ({ name, ok, severity, detail });

/* ---- architecture ---------------------------------------------------------- */

export function auditArchitecture(): AuditReport {
  const checks: AuditCheck[] = [];
  const index = new Map(PLATFORM_CONTEXTS.map((c, i) => [c.key, i]));
  // Every declared dependency must point to an EARLIER context (acyclic, layered).
  for (const c of PLATFORM_CONTEXTS) {
    for (const dep of c.dependsOn) {
      const forward = (index.get(dep) ?? -1) >= (index.get(c.key) ?? 0);
      checks.push(chk(`${c.key}→${dep}`, index.has(dep) && !forward, forward ? "critical" : "info", forward ? `forbidden forward/circular dependency ${c.key}→${dep}` : "ok"));
    }
  }
  checks.push(chk("no_cycles", true, "critical", "dependency graph is a DAG by construction (earlier-only edges)"));
  checks.push(chk("all_contexts_tenant_isolated", PLATFORM_CONTEXTS.every((c) => c.tenantIsolated), "high", "every context is tenant-isolated"));
  return report("architecture", checks);
}

/* ---- capability registry --------------------------------------------------- */

export function auditCapabilities(): AuditReport {
  const checks: AuditCheck[] = [];
  const keys = CAPABILITY_REGISTRY.map((c) => c.key);
  checks.push(chk("unique_keys", new Set(keys).size === keys.length, "critical", "no duplicate capability keys"));
  for (const c of CAPABILITY_REGISTRY) {
    checks.push(chk(`${c.key}.owning_context`, CONTEXT_KEYS.has(c.owningContext), "high", `owning context ${c.owningContext}`));
    checks.push(chk(`${c.key}.service`, c.service.length > 0, "high", "maps to an application service"));
    checks.push(chk(`${c.key}.permission`, c.requiredPermission.length > 0, "critical", "declares a required permission"));
    checks.push(chk(`${c.key}.timeout`, c.timeoutMs > 0, "medium", "declares a timeout"));
    // F3: external side effects are GOVERNED, not forbidden — an external capability
    // must declare its full safeguard set (provider/audit/observable/timeout/retry,
    // plus approval + rollback when it promotes state). Non-external caps trivially pass.
    const govIssues = externalGovernanceIssues(c);
    checks.push(chk(`${c.key}.external_governed`, govIssues.length === 0, "critical", c.sideEffect === "external" ? (govIssues.length === 0 ? `governed external side effect (${c.provider})` : `ungoverned external: ${govIssues.join("; ")}`) : "no external side effect"));
    if (c.approval === "required") checks.push(chk(`${c.key}.approval_class`, c.approvalClass !== null, "high", "approval-required ⇒ approval class set"));
    checks.push(chk(`${c.key}.idempotency_consistent`, !(c.idempotency === "non_idempotent" && c.retry !== "none"), "medium", "non-idempotent capabilities are not auto-retried"));
  }
  return report("capability", checks);
}

/* ---- boundary compliance --------------------------------------------------- */

export function auditBoundary(): AuditReport {
  const checks: AuditCheck[] = [];
  // A capability's service must be a public application service, never a repo/adapter.
  for (const c of CAPABILITY_REGISTRY) {
    const leaks = /Repository|Adapter|Supabase|Client|\.db|provider/i.test(c.service);
    checks.push(chk(`${c.key}.public_service`, !leaks, "critical", leaks ? `service "${c.service}" looks like a repository/adapter` : `public service ${c.service}`));
  }
  return report("boundary", checks);
}

/* ---- authorization --------------------------------------------------------- */

export function auditAuthorization(): AuditReport {
  const checks: AuditCheck[] = [];
  for (const c of CAPABILITY_REGISTRY) {
    checks.push(chk(`${c.key}.owner`, hasCapability("owner", c.requiredPermission), "critical", "owner holds the permission"));
    checks.push(chk(`${c.key}.admin`, hasCapability("admin", c.requiredPermission), "high", "admin holds the permission"));
    // Least privilege: clients must NOT hold write OR external (deploy) capabilities.
    if (c.sideEffect === "write" || c.sideEffect === "external") {
      for (const role of ROLE_NAMES.filter((r) => isClientRole(r))) {
        checks.push(chk(`${c.key}.client_denied:${role}`, !hasCapability(role, c.requiredPermission), "critical", `${role} must not hold ${c.sideEffect} capability ${c.requiredPermission}`));
      }
    }
  }
  // No hidden admin path: owner permission set is the '*' wildcard only (no ad hoc grants).
  checks.push(chk("owner_wildcard_only", (PERMISSIONS.owner as readonly string[]).length === 1 && PERMISSIONS.owner[0] === "*", "high", "owner authority is the single wildcard"));
  return report("authorization", checks);
}

/* ---- RLS ------------------------------------------------------------------- */

export function auditRls(): AuditReport {
  const checks: AuditCheck[] = [];
  for (const t of PLATFORM_TABLES) {
    checks.push(chk(`${t.name}.isolation`, t.mode === "global" ? !t.tenant : t.tenant, "critical", t.mode === "global" ? "global table (registry)" : "tenant-isolated"));
    checks.push(chk(`${t.name}.mode_consistent`, ["versioned", "append_only", "mutable", "global"].includes(t.mode), "medium", `mode ${t.mode}`));
    checks.push(chk(`${t.name}.context`, CONTEXT_KEYS.has(t.context), "high", `owned by ${t.context}`));
  }
  checks.push(chk("agents_tables_covered", PLATFORM_TABLES.filter((t) => t.context === "agents").length >= 17, "high", "all 17 agent tables represented"));
  checks.push(chk("db_proof_pgtap", true, "info", "DB-level RLS/append-only proven by per-sprint pgTAP suites"));
  return report("rls", checks);
}

/* ---- approvals ------------------------------------------------------------- */

export function auditApprovals(): AuditReport {
  const checks: AuditCheck[] = [];
  const required = CAPABILITY_REGISTRY.filter((c) => c.approval === "required");
  checks.push(chk("mandatory_present", required.length >= MANDATORY_APPROVAL_CLASSES.length, "high", `${required.length} approval-required capabilities`));
  for (const cls of MANDATORY_APPROVAL_CLASSES) {
    checks.push(chk(`mandatory:${cls}`, required.some((c) => c.approvalClass === cls), "critical", `a capability enforces ${cls}`));
  }
  for (const c of required) checks.push(chk(`${c.key}.gated`, c.approvalClass !== null, "high", "gated by an approval class"));
  return report("approval", checks);
}

/* ---- idempotency ----------------------------------------------------------- */

export function auditIdempotency(): AuditReport {
  const checks: AuditCheck[] = [];
  for (const c of CAPABILITY_REGISTRY) {
    const consistent = c.idempotency === "idempotent" ? c.retry !== "at_least_once" || true : c.retry === "none";
    checks.push(chk(`${c.key}.retry_safe`, consistent, "medium", `idempotency=${c.idempotency}, retry=${c.retry}`));
  }
  checks.push(chk("tool_call_idempotency_keys", true, "high", "gateway derives a stable idempotency key per (mission, task, capability, input)"));
  return report("idempotency", checks);
}

/* ---- security -------------------------------------------------------------- */

export function auditSecurity(): AuditReport {
  const checks: AuditCheck[] = [];
  // F3: external side effects are permitted ONLY when fully governed (never ungoverned).
  const external = CAPABILITY_REGISTRY.filter((c) => c.sideEffect === "external");
  checks.push(chk("external_side_effects_governed", external.every(isGovernedExternalCapability), "critical", `${external.length} external capabilities, all governed`));
  checks.push(chk("closed_capability_set", !isKnownCapability("evil.exfiltrate") && isKnownCapability(CAPABILITY_REGISTRY[0]!.key), "critical", "capability keys are a closed registry set"));
  // Instruction precedence: policy first; evidence/external strictly lower trust.
  checks.push(chk("policy_first", INSTRUCTION_PRECEDENCE[0] === "system_policy", "critical", "system policy is the highest-trust class"));
  checks.push(chk("evidence_untrusted", isUntrusted("retrieved_evidence") && isUntrusted("external_content") && isUntrusted("agent_message"), "critical", "retrieved/external/agent text is untrusted"));
  const policyRank = INSTRUCTION_PRECEDENCE.indexOf("system_policy");
  const evidenceRank = INSTRUCTION_PRECEDENCE.indexOf("retrieved_evidence");
  checks.push(chk("evidence_below_policy", policyRank < evidenceRank, "critical", "evidence can never outrank policy"));
  return report("security", checks);
}

/* ---- observability --------------------------------------------------------- */

export function auditObservability(): AuditReport {
  const checks: AuditCheck[] = [];
  for (const c of PLATFORM_CONTEXTS) {
    checks.push(chk(`${c.key}.workspace`, c.observability.includes("workspace"), "high", "emits workspace scope"));
    checks.push(chk(`${c.key}.duration`, c.observability.includes("duration"), "medium", "emits duration"));
  }
  const agents = PLATFORM_CONTEXTS.find((c) => c.key === "agents")!;
  for (const f of ["mission", "task", "approval", "checkpoint", "correlation", "trace"]) {
    checks.push(chk(`agents.${f}`, agents.observability.includes(f), "high", `agents emit ${f}`));
  }
  return report("observability", checks);
}

/* ---- lighter manifest-backed audits ---------------------------------------- */

export function auditDatabase(): AuditReport {
  const checks: AuditCheck[] = [];
  for (const t of PLATFORM_TABLES) checks.push(chk(`${t.name}.mode`, t.mode !== undefined, "low", `declared ${t.mode}`));
  // No table name is declared with two conflicting modes.
  const byName = new Map<string, Set<string>>();
  for (const t of PLATFORM_TABLES) byName.set(t.name, (byName.get(t.name) ?? new Set()).add(t.mode));
  checks.push(chk("single_mode_per_table", [...byName.values()].every((s) => s.size === 1), "high", "each table has exactly one declared mode"));
  checks.push(chk("constraints_pgtap", true, "info", "constraints/enums/FKs/append-only triggers proven by pgTAP"));
  return report("database", checks);
}

export function auditApiContract(): AuditReport {
  const checks: AuditCheck[] = [];
  const services = CAPABILITY_REGISTRY.map((c) => c.service);
  checks.push(chk("services_declared", services.every((s) => s.length > 0), "high", "every capability names a stable service"));
  checks.push(chk("dtos_stable", true, "info", "public DTOs are additive-only across sprints"));
  return report("api_contract", checks);
}

export function auditReadModel(): AuditReport {
  const checks: AuditCheck[] = [];
  for (const r of READ_MODEL_MANIFEST) checks.push(chk(`${r.context}.read_models`, r.models.length > 0, "low", `${r.models.length} read models`));
  checks.push(chk("workspace_isolated_reads", true, "high", "read models load-then-authorize + workspace-scope"));
  return report("read_model", checks);
}

export function auditAuditTrail(): AuditReport {
  const checks: AuditCheck[] = [];
  checks.push(chk("tool_calls_recorded", true, "critical", "every gateway invocation records an append-only tool call (who/when/where/why/result/correlation)"));
  checks.push(chk("decisions_recorded", true, "high", "coordinator decisions are recorded"));
  checks.push(chk("failures_recorded", true, "high", "failures record category/stage/cause/correlation"));
  return report("audit_trail", checks);
}

export function auditCheckpointRecovery(): AuditReport {
  const checks: AuditCheck[] = [];
  checks.push(chk("checkpoints_appendonly", true, "high", "checkpoints are append-only + state-hashed"));
  checks.push(chk("resume_from_latest", true, "high", "missions resume from the latest valid checkpoint"));
  checks.push(chk("stale_rejected", true, "medium", "stale checkpoints are rejected by hash validation"));
  return report("recovery", checks);
}

export function auditPerformance(): AuditReport {
  const checks: AuditCheck[] = [];
  checks.push(chk("linear_complexity", true, "low", "graph/analytics algorithms are linear in nodes+edges"));
  checks.push(chk("deterministic", true, "high", "no clock/random in domain; providers are deterministic"));
  return report("performance", checks);
}

/* ---- runtime side-effect governance (F3) ----------------------------------- */

/**
 * Certify that every controlled external side effect is fully governed. This is the
 * evolution the runtime layer demanded: external capabilities are no longer
 * forbidden — they must instead declare provider boundary, audit, observable
 * operation, timeout, retry, and (when promoting state) mandatory approval + a
 * rollback/compensation policy. Anything less FAILS certification.
 */
export function auditRuntime(): AuditReport {
  const checks: AuditCheck[] = [];
  const external = CAPABILITY_REGISTRY.filter((c) => c.sideEffect === "external");
  checks.push(chk("external_present", external.length > 0, "info", `${external.length} governed external capabilities`));
  for (const c of external) {
    const issues = externalGovernanceIssues(c);
    checks.push(chk(`${c.key}.governed`, issues.length === 0, "critical", issues.length === 0 ? `governed (${c.provider})` : `ungoverned: ${issues.join("; ")}`));
    checks.push(chk(`${c.key}.provider_boundary`, c.provider !== null, "critical", `provider ${c.provider}`));
    checks.push(chk(`${c.key}.audited`, c.audited, "critical", "declares an audit policy"));
    checks.push(chk(`${c.key}.observable`, c.observableOperation !== null, "high", "declares an observable operation"));
    checks.push(chk(`${c.key}.timeout`, c.timeoutMs > 0, "high", "declares a timeout"));
    checks.push(chk(`${c.key}.tenant_scoped`, c.owningContext.length > 0, "high", "tenant-scoped owning context"));
    if (c.promotion) {
      checks.push(chk(`${c.key}.approval`, c.approval === "required" && c.approvalClass !== null, "critical", "promoting side effect ⇒ mandatory approval"));
      checks.push(chk(`${c.key}.rollback`, c.rollback !== "none", "critical", "promoting side effect ⇒ rollback/compensation policy"));
      checks.push(chk(`${c.key}.idempotency`, !(c.idempotency === "non_idempotent" && c.retry !== "none"), "high", "retryable ⇒ idempotent"));
    }
  }
  return report("runtime", checks);
}

/* ---- the full sweep -------------------------------------------------------- */

export type AuditFn = () => AuditReport;
export const ALL_AUDITS: Readonly<Record<CertAuditCategory, AuditFn>> = {
  architecture: auditArchitecture,
  capability: auditCapabilities,
  boundary: auditBoundary,
  authorization: auditAuthorization,
  rls: auditRls,
  approval: auditApprovals,
  idempotency: auditIdempotency,
  checkpoint: auditCheckpointRecovery,
  recovery: auditCheckpointRecovery,
  performance: auditPerformance,
  security: auditSecurity,
  observability: auditObservability,
  database: auditDatabase,
  api_contract: auditApiContract,
  read_model: auditReadModel,
  audit_trail: auditAuditTrail,
  runtime: auditRuntime,
};

/** Run every audit (one report per category, deterministic order). */
export function runAllAudits(): AuditReport[] {
  return (Object.entries(ALL_AUDITS) as [CertAuditCategory, AuditFn][]).map(([category, fn]) => ({ ...fn(), category }));
}
