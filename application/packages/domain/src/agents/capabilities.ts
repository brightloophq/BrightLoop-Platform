/* =============================================================================
 * Capability Registry (Phase E · Sprint E7; evolved in Phase F · Sprint F3) — PURE.
 *
 * The FORMAL registry of every capability an agent may invoke. Agents select
 * capabilities ONLY by key through this registry — never by importing an
 * application service ad hoc, and never from prompt-controlled free text. Each
 * entry declares its owning context, the public service it maps to, the required
 * permission, and its side-effect / approval / retry / idempotency / timeout /
 * cost classifications.
 *
 * F3 introduces GOVERNED external side effects. An `external` capability is only
 * invocable when it declares the full safeguard set (provider boundary, audit,
 * observable operation, timeout, retry) and — when it PROMOTES runtime state
 * (deploy/activate/rollback) — a mandatory approval + a rollback/compensation
 * policy. Ungoverned external capabilities remain rejected. No io.
 * ========================================================================== */

import type {
  ApprovalClass, CapabilityApprovalClass, CostCategory, IdempotencyClass, RetryClass, SideEffectClass,
} from "@brightloop/schema";

/** Rollback / compensation posture for a state-changing capability. */
export type RollbackClass = "none" | "supported" | "compensation";

export interface CapabilitySpec {
  key: string;
  owningContext: string;
  service: string;
  requiredPermission: string;
  sideEffect: SideEffectClass;
  approval: CapabilityApprovalClass;
  approvalClass: ApprovalClass | null;
  retry: RetryClass;
  idempotency: IdempotencyClass;
  timeoutMs: number;
  costCategory: CostCategory;
  description: string;
  /* ---- F3 governance safeguards (additive; defaulted for existing entries) --- */
  /** The external provider boundary this capability crosses (null ⇒ internal). */
  provider: string | null;
  /** Whether every invocation is recorded to an append-only audit trail. */
  audited: boolean;
  /** Rollback/compensation posture (state-changing external caps must declare one). */
  rollback: RollbackClass;
  /** A stable, provider-neutral observable operation name for metrics/tracing. */
  observableOperation: string | null;
  /** True when the capability ESTABLISHES/PROMOTES external state (needs approval). */
  promotion: boolean;
}

type SpecInput = Omit<CapabilitySpec, "approvalClass" | "provider" | "audited" | "rollback" | "observableOperation" | "promotion">
  & Partial<Pick<CapabilitySpec, "approvalClass" | "provider" | "audited" | "rollback" | "observableOperation" | "promotion">>;

const R = (s: SpecInput): CapabilitySpec => ({
  approvalClass: null, provider: null, audited: false, rollback: "none", observableOperation: null, promotion: false, ...s,
});

/**
 * The canonical registry. Every capability maps to exactly one PUBLIC application
 * service of a bounded context. External capabilities (F3) are GOVERNED (see the
 * governance helpers below); ungoverned external keys are never invocable.
 */
export const CAPABILITY_REGISTRY: readonly CapabilitySpec[] = [
  // ---- Knowledge (E2) ----
  R({ key: "knowledge.retrieve_context", owningContext: "knowledge", service: "getKnowledgeUsage", requiredPermission: "knowledge.read", sideEffect: "read", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 20_000, costCategory: "low", description: "Retrieve knowledge context/usage for evidence assembly." }),
  // ---- Strategy (E3) ----
  R({ key: "strategy.list_history", owningContext: "strategist", service: "listStrategyHistory", requiredPermission: "strategy.read", sideEffect: "read", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 20_000, costCategory: "low", description: "List strategy sessions in the workspace." }),
  R({ key: "strategy.get_result", owningContext: "strategist", service: "getStrategyResult", requiredPermission: "strategy.read", sideEffect: "read", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 20_000, costCategory: "low", description: "Read an approved/analysed strategy result." }),
  R({ key: "strategy.run_analysis", owningContext: "strategist", service: "runBusinessAnalysis", requiredPermission: "strategy.run", sideEffect: "write", approval: "none", retry: "none", idempotency: "non_idempotent", timeoutMs: 60_000, costCategory: "high", description: "Run business analysis (generation)." }),
  // ---- Project Manager (E4) ----
  R({ key: "planning.list_sessions", owningContext: "project-manager", service: "listPlanningSessions", requiredPermission: "planning.read", sideEffect: "read", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 20_000, costCategory: "low", description: "List planning sessions." }),
  R({ key: "planning.get_execution_plan", owningContext: "project-manager", service: "getExecutionPlanResult", requiredPermission: "planning.read", sideEffect: "read", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 20_000, costCategory: "low", description: "Read a structured execution plan." }),
  R({ key: "planning.generate_plan", owningContext: "project-manager", service: "generateExecutionPlan", requiredPermission: "planning.run", sideEffect: "write", approval: "none", retry: "none", idempotency: "non_idempotent", timeoutMs: 60_000, costCategory: "high", description: "Generate an execution plan from an approved strategy." }),
  R({ key: "planning.validate_plan", owningContext: "project-manager", service: "validateExecutionPlan", requiredPermission: "planning.review", sideEffect: "read", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 20_000, costCategory: "low", description: "Validate an execution plan." }),
  R({ key: "planning.approve_plan", owningContext: "project-manager", service: "approveExecutionPlan", requiredPermission: "planning.approve", sideEffect: "write", approval: "required", approvalClass: "plan_approval", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 60_000, costCategory: "medium", description: "Approve + materialize an execution plan (human approval required)." }),
  // ---- Automation Builder (E5) ----
  R({ key: "automation.list_intents", owningContext: "automation-builder", service: "listExecutionIntents", requiredPermission: "automation.read", sideEffect: "read", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 20_000, costCategory: "low", description: "List automation execution intents." }),
  R({ key: "automation.create_intent", owningContext: "automation-builder", service: "createExecutionIntent", requiredPermission: "automation.write", sideEffect: "write", approval: "none", retry: "none", idempotency: "non_idempotent", timeoutMs: 30_000, costCategory: "medium", description: "Create an execution intent from an approved plan." }),
  R({ key: "automation.build_workflow", owningContext: "automation-builder", service: "buildWorkflow", requiredPermission: "automation.generate", sideEffect: "write", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 60_000, costCategory: "high", description: "Build the workflow DAG for an intent." }),
  R({ key: "automation.validate_workflow", owningContext: "automation-builder", service: "validateWorkflow", requiredPermission: "automation.read", sideEffect: "read", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 20_000, costCategory: "low", description: "Validate a workflow." }),
  R({ key: "automation.simulate_workflow", owningContext: "automation-builder", service: "simulateWorkflow", requiredPermission: "automation.read", sideEffect: "read", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 20_000, costCategory: "low", description: "Dry-run a workflow (no execution)." }),
  R({ key: "automation.publish_workflow", owningContext: "automation-builder", service: "publishWorkflow", requiredPermission: "automation.publish", sideEffect: "write", approval: "required", approvalClass: "workflow_publish", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 30_000, costCategory: "medium", description: "Publish a workflow version (human approval required)." }),
  R({ key: "automation.generate_deployment", owningContext: "automation-builder", service: "generateDeploymentPackage", requiredPermission: "automation.deploy", sideEffect: "write", approval: "required", approvalClass: "deployment_package", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 30_000, costCategory: "medium", description: "Prepare a deployment package (human approval required; never deployed)." }),
  // ---- Reporting (E6) ----
  R({ key: "reporting.generate_report", owningContext: "reporting", service: "generateExecutiveReport", requiredPermission: "report.generate", sideEffect: "write", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 60_000, costCategory: "high", description: "Generate an executive report from observed upstream outputs." }),
  R({ key: "reporting.get_report", owningContext: "reporting", service: "getReportDetail", requiredPermission: "report.read", sideEffect: "read", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 20_000, costCategory: "low", description: "Read a structured report." }),
  // ---- Phase D Execution ----
  R({ key: "execution.get_workspace_state", owningContext: "transformation-execution", service: "getWorkspaceExecution", requiredPermission: "transformation.read", sideEffect: "read", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 20_000, costCategory: "low", description: "Read the workspace execution state." }),

  // ---- Execution Runtime (F3) — internal reads/writes ----
  R({ key: "runtime.read", owningContext: "execution-runtime", service: "getRuntimeDetail", requiredPermission: "runtime.read", sideEffect: "read", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 20_000, costCategory: "low", description: "Read a runtime registration + health/capabilities." }),
  R({ key: "deployment.read", owningContext: "execution-runtime", service: "getDeploymentDetail", requiredPermission: "deployment.read", sideEffect: "read", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 20_000, costCategory: "low", description: "Read a deployment + its timeline." }),
  R({ key: "execution.read", owningContext: "execution-runtime", service: "getRuntimeExecutionDetail", requiredPermission: "execution.read", sideEffect: "read", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 20_000, costCategory: "low", description: "Read a runtime execution + attempts/failures." }),
  R({ key: "runtime.register", owningContext: "execution-runtime", service: "registerRuntime", requiredPermission: "runtime.manage", sideEffect: "write", approval: "none", retry: "none", idempotency: "non_idempotent", timeoutMs: 20_000, costCategory: "low", description: "Register an external runtime (Auxion remains the system of record)." }),
  R({ key: "deployment.create", owningContext: "execution-runtime", service: "createDeploymentRequest", requiredPermission: "deployment.create", sideEffect: "write", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 20_000, costCategory: "low", description: "Create a deployment request from an approved E5 package." }),

  // ---- Execution Runtime (F3) — GOVERNED external, non-promoting (safe reads/probes/mitigations) ----
  R({ key: "runtime.health_check", owningContext: "execution-runtime", service: "checkRuntimeHealth", requiredPermission: "runtime.health.check", sideEffect: "external", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 15_000, costCategory: "low", provider: "n8n", audited: true, observableOperation: "runtime.health_check", description: "Probe runtime health (external read; no state change)." }),
  R({ key: "runtime.validate_connection", owningContext: "execution-runtime", service: "validateRuntimeConnection", requiredPermission: "runtime.health.check", sideEffect: "external", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 15_000, costCategory: "low", provider: "n8n", audited: true, observableOperation: "runtime.validate_connection", description: "Validate runtime connectivity + auth (external read)." }),
  R({ key: "deployment.reconcile", owningContext: "execution-runtime", service: "reconcileDeployment", requiredPermission: "deployment.reconcile", sideEffect: "external", approval: "none", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 30_000, costCategory: "low", provider: "n8n", audited: true, observableOperation: "runtime.reconcile", description: "Reconcile Auxion's deployment state with the provider (external read + drift)." }),
  R({ key: "execution.stop", owningContext: "execution-runtime", service: "stopRuntimeExecution", requiredPermission: "execution.stop", sideEffect: "external", approval: "none", retry: "none", idempotency: "idempotent", timeoutMs: 20_000, costCategory: "low", provider: "n8n", audited: true, rollback: "none", observableOperation: "runtime.stop_execution", description: "Stop a running execution (safety mitigation; no approval)." }),

  // ---- Execution Runtime (F3) — GOVERNED external, PROMOTING (mandatory approval + rollback) ----
  R({ key: "deployment.deploy", owningContext: "execution-runtime", service: "deployPackage", requiredPermission: "deployment.deploy", sideEffect: "external", approval: "required", approvalClass: "external_side_effect", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 60_000, costCategory: "high", provider: "n8n", audited: true, rollback: "supported", observableOperation: "runtime.deploy_workflow", promotion: true, description: "Deploy an approved package to an external runtime (governed external side effect)." }),
  R({ key: "deployment.activate", owningContext: "execution-runtime", service: "activateDeployment", requiredPermission: "deployment.activate", sideEffect: "external", approval: "required", approvalClass: "external_side_effect", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 30_000, costCategory: "medium", provider: "n8n", audited: true, rollback: "supported", observableOperation: "runtime.activate_workflow", promotion: true, description: "Activate a deployed workflow (governed external side effect)." }),
  R({ key: "deployment.rollback", owningContext: "execution-runtime", service: "rollbackDeployment", requiredPermission: "deployment.rollback", sideEffect: "external", approval: "required", approvalClass: "external_side_effect", retry: "idempotent_retry", idempotency: "idempotent", timeoutMs: 60_000, costCategory: "high", provider: "n8n", audited: true, rollback: "compensation", observableOperation: "runtime.rollback_deployment", promotion: true, description: "Roll back to a previous immutable deployment version (compensating external side effect)." }),
];

const BY_KEY = new Map(CAPABILITY_REGISTRY.map((c) => [c.key, c]));

export function getCapability(key: string): CapabilitySpec | undefined { return BY_KEY.get(key); }
export function isKnownCapability(key: string): boolean { return BY_KEY.has(key); }
export function listCapabilities(): readonly CapabilitySpec[] { return CAPABILITY_REGISTRY; }
export function capabilityRequiresApproval(key: string): boolean { return BY_KEY.get(key)?.approval === "required"; }
export function capabilityApprovalClass(key: string): ApprovalClass | null { return BY_KEY.get(key)?.approvalClass ?? null; }

/* ---- F3 external-side-effect governance ------------------------------------ */

/**
 * The safeguards a capability MUST declare to perform a governed external side
 * effect. Every external capability declares provider boundary, audit, observable
 * operation, a positive timeout, and a retry posture consistent with idempotency;
 * a PROMOTING external capability (establishes/promotes runtime state) additionally
 * declares a mandatory approval + a non-trivial rollback/compensation policy.
 * Returns the list of UNMET safeguards ("" list ⇒ fully governed).
 */
export function externalGovernanceIssues(c: CapabilitySpec): string[] {
  if (c.sideEffect !== "external") return [];
  const issues: string[] = [];
  if (c.provider === null) issues.push("missing provider boundary");
  if (!c.audited) issues.push("missing audit policy");
  if (c.observableOperation === null) issues.push("missing observable operation");
  if (c.timeoutMs <= 0) issues.push("missing timeout");
  if (c.idempotency === "non_idempotent" && c.retry !== "none") issues.push("non-idempotent capability is auto-retried");
  if (c.promotion) {
    if (c.approval !== "required") issues.push("promoting side effect without mandatory approval");
    if (c.approvalClass === null) issues.push("promoting side effect without approval class");
    if (c.rollback === "none") issues.push("promoting side effect without rollback/compensation policy");
  }
  return issues;
}

/** True when an external capability declares every required safeguard. */
export function isGovernedExternalCapability(c: CapabilitySpec): boolean {
  return c.sideEffect === "external" && externalGovernanceIssues(c).length === 0;
}

/**
 * A capability is invocable iff it is known AND either not an external side effect,
 * or a FULLY GOVERNED external side effect. Ungoverned external keys stay rejected.
 */
export function isInvocableCapability(key: string): boolean {
  const c = BY_KEY.get(key);
  if (c === undefined) return false;
  return c.sideEffect !== "external" || isGovernedExternalCapability(c);
}
