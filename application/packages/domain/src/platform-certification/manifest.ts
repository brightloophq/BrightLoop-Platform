/* =============================================================================
 * Platform manifest (Phase E · Sprint E8) — the declared source of truth the
 * certification audits check the live platform against. PURE data. No io.
 *
 * Contexts are listed in strict dependency order (foundation → agents →
 * certification). The rule the architecture audit enforces: a context may only
 * depend on contexts that appear EARLIER in this list — which makes the whole
 * dependency graph acyclic and layered by construction.
 * ========================================================================== */

export interface ContextManifest {
  key: string;
  label: string;
  /** Upstream contexts this one consumes — ONLY via their application services. */
  dependsOn: readonly string[];
  /** Number of persisted tables the context owns. */
  tableCount: number;
  /** True when every owned table is tenant-isolated by RLS (else global). */
  tenantIsolated: boolean;
  /** Observability fields the context emits on its records. */
  observability: readonly string[];
}

/** Contexts in dependency order (index = layer). */
export const PLATFORM_CONTEXTS: readonly ContextManifest[] = [
  { key: "transformation-execution", label: "Phase D · Execution", dependsOn: [], tableCount: 11, tenantIsolated: true, observability: ["workspace", "duration"] },
  { key: "ai-foundation", label: "E1 · AI Foundation", dependsOn: [], tableCount: 11, tenantIsolated: true, observability: ["workspace", "provider", "model", "tokens", "cost", "duration"] },
  { key: "knowledge", label: "E2 · Knowledge Base", dependsOn: ["ai-foundation"], tableCount: 11, tenantIsolated: true, observability: ["workspace", "duration", "cost"] },
  { key: "strategist", label: "E3 · AI Strategist", dependsOn: ["ai-foundation", "knowledge"], tableCount: 9, tenantIsolated: true, observability: ["workspace", "provider", "model", "tokens", "cost", "duration"] },
  { key: "project-manager", label: "E4 · AI Project Manager", dependsOn: ["ai-foundation", "knowledge", "strategist", "transformation-execution"], tableCount: 12, tenantIsolated: true, observability: ["workspace", "provider", "model", "tokens", "cost", "duration"] },
  { key: "automation-builder", label: "E5 · Automation Builder", dependsOn: ["project-manager"], tableCount: 12, tenantIsolated: true, observability: ["workspace", "provider", "model", "tokens", "cost", "duration"] },
  { key: "reporting", label: "E6 · AI Reporting", dependsOn: ["transformation-execution", "ai-foundation", "knowledge", "strategist", "project-manager", "automation-builder"], tableCount: 12, tenantIsolated: true, observability: ["workspace", "provider", "model", "tokens", "cost", "duration"] },
  { key: "agents", label: "E7 · AI Agents", dependsOn: ["transformation-execution", "ai-foundation", "knowledge", "strategist", "project-manager", "automation-builder", "reporting"], tableCount: 17, tenantIsolated: true, observability: ["workspace", "mission", "task", "approval", "checkpoint", "correlation", "trace", "provider", "model", "tokens", "cost", "duration"] },
  { key: "platform-certification", label: "E8 · Certification", dependsOn: ["transformation-execution", "ai-foundation", "knowledge", "strategist", "project-manager", "automation-builder", "reporting", "agents"], tableCount: 4, tenantIsolated: true, observability: ["workspace", "correlation", "duration"] },
  { key: "execution-runtime", label: "F3 · Execution Runtime", dependsOn: ["automation-builder", "agents"], tableCount: 15, tenantIsolated: true, observability: ["workspace", "runtime", "deployment", "execution", "provider", "operation", "correlation", "trace", "duration"] },
];

export type TableMode = "versioned" | "append_only" | "mutable" | "global";
export interface TableManifest { name: string; context: string; mode: TableMode; tenant: boolean }

/**
 * Security-sensitive tables whose isolation + mutability posture the RLS/database
 * audits assert. The full DB-level RLS/append-only/constraint proof lives in the
 * per-sprint pgTAP suites; this manifest asserts the declared posture is internally
 * consistent and complete for the audited contexts.
 */
export const PLATFORM_TABLES: readonly TableManifest[] = [
  // E7 agents (most security-critical)
  { name: "agent_profile", context: "agents", mode: "versioned", tenant: true },
  { name: "agent_mission", context: "agents", mode: "versioned", tenant: true },
  { name: "agent_run", context: "agents", mode: "versioned", tenant: true },
  { name: "agent_task", context: "agents", mode: "versioned", tenant: true },
  { name: "agent_approval", context: "agents", mode: "versioned", tenant: true },
  { name: "agent_tool_call", context: "agents", mode: "append_only", tenant: true },
  { name: "agent_delegation", context: "agents", mode: "append_only", tenant: true },
  { name: "agent_message", context: "agents", mode: "append_only", tenant: true },
  { name: "agent_observation", context: "agents", mode: "append_only", tenant: true },
  { name: "agent_decision", context: "agents", mode: "append_only", tenant: true },
  { name: "agent_checkpoint", context: "agents", mode: "append_only", tenant: true },
  { name: "agent_evaluation", context: "agents", mode: "append_only", tenant: true },
  { name: "agent_memory", context: "agents", mode: "append_only", tenant: true },
  { name: "agent_artifact", context: "agents", mode: "append_only", tenant: true },
  { name: "agent_failure", context: "agents", mode: "append_only", tenant: true },
  { name: "agent_feedback", context: "agents", mode: "append_only", tenant: true },
  { name: "capability_definition", context: "agents", mode: "global", tenant: false },
  // E6 reporting (roots + append-only)
  { name: "executive_report", context: "reporting", mode: "versioned", tenant: true },
  { name: "business_metric", context: "reporting", mode: "append_only", tenant: true },
  { name: "report_feedback", context: "reporting", mode: "append_only", tenant: true },
  // E5 automation
  { name: "execution_intent", context: "automation-builder", mode: "versioned", tenant: true },
  { name: "workflow_definition", context: "automation-builder", mode: "mutable", tenant: true },
  { name: "automation_version", context: "automation-builder", mode: "append_only", tenant: true },
  // E4 planning
  { name: "planning_session", context: "project-manager", mode: "versioned", tenant: true },
  { name: "execution_plan", context: "project-manager", mode: "mutable", tenant: true },
  { name: "planning_feedback", context: "project-manager", mode: "append_only", tenant: true },
  // E8 certification
  { name: "certification_run", context: "platform-certification", mode: "versioned", tenant: true },
  { name: "certification_result", context: "platform-certification", mode: "append_only", tenant: true },
  { name: "certification_issue", context: "platform-certification", mode: "append_only", tenant: true },
  { name: "certification_exception", context: "platform-certification", mode: "append_only", tenant: true },
  // F3 execution runtime (roots + append-only history/logs; credential ref is internal-only)
  { name: "runtime_registration", context: "execution-runtime", mode: "versioned", tenant: true },
  { name: "runtime_policy", context: "execution-runtime", mode: "versioned", tenant: true },
  { name: "runtime_credential_reference", context: "execution-runtime", mode: "mutable", tenant: true },
  { name: "runtime_capability_snapshot", context: "execution-runtime", mode: "append_only", tenant: true },
  { name: "runtime_health_snapshot", context: "execution-runtime", mode: "append_only", tenant: true },
  { name: "runtime_deployment", context: "execution-runtime", mode: "versioned", tenant: true },
  { name: "runtime_deployment_attempt", context: "execution-runtime", mode: "append_only", tenant: true },
  { name: "runtime_deployment_event", context: "execution-runtime", mode: "append_only", tenant: true },
  { name: "runtime_deployment_log", context: "execution-runtime", mode: "append_only", tenant: true },
  { name: "runtime_execution", context: "execution-runtime", mode: "versioned", tenant: true },
  { name: "runtime_execution_attempt", context: "execution-runtime", mode: "append_only", tenant: true },
  { name: "runtime_execution_failure", context: "execution-runtime", mode: "append_only", tenant: true },
  { name: "runtime_rollback_request", context: "execution-runtime", mode: "versioned", tenant: true },
  { name: "runtime_webhook_receipt", context: "execution-runtime", mode: "append_only", tenant: true },
  { name: "runtime_reconciliation", context: "execution-runtime", mode: "append_only", tenant: true },
];

/** The mandatory human-approval classes the platform enforces. */
export const MANDATORY_APPROVAL_CLASSES: readonly string[] = ["plan_approval", "workflow_publish", "deployment_package", "external_side_effect"];

/** Public read models each context exposes (for the read-model audit). */
export const READ_MODEL_MANIFEST: readonly { context: string; models: readonly string[] }[] = [
  { context: "agents", models: ["Agent Ops Dashboard", "Mission Queue", "Mission Detail", "Task Graph", "Approval Queue", "Capability Usage", "Cost/Token Usage"] },
  { context: "reporting", models: ["Executive Dashboard", "KPI Dashboard", "Trend Dashboard", "Forecast Dashboard", "Insight Dashboard", "Report History"] },
  { context: "automation-builder", models: ["Automation Dashboard", "Workflow Library", "Deployment Queue", "Version History"] },
  { context: "project-manager", models: ["Execution Dashboard", "Timeline View", "Dependency Graph", "Risk Register", "KPI Dashboard"] },
  { context: "platform-certification", models: ["Certification Dashboard", "Architecture Report", "Security Report", "RLS Report", "Production Readiness"] },
  { context: "execution-runtime", models: ["Runtime Registry", "Runtime Detail", "Runtime Health", "Deployment List", "Deployment Detail", "Deployment Timeline", "Execution List", "Execution Detail", "Drift Report", "Rollback History", "Runtime Ops Dashboard", "Production Deployment Queue"] },
];
