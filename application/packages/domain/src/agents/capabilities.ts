/* =============================================================================
 * Capability Registry (Phase E · Sprint E7) — PURE.
 *
 * The FORMAL registry of every capability an agent may invoke. Agents select
 * capabilities ONLY by key through this registry — never by importing an
 * application service ad hoc, and never from prompt-controlled free text. Each
 * entry declares its owning context, the public service it maps to, the required
 * permission, and its side-effect / approval / retry / idempotency / timeout /
 * cost classifications. No io.
 * ========================================================================== */

import type {
  ApprovalClass, CapabilityApprovalClass, CostCategory, IdempotencyClass, RetryClass, SideEffectClass,
} from "@brightloop/schema";

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
}

const R = (s: Omit<CapabilitySpec, "approvalClass"> & { approvalClass?: ApprovalClass | null }): CapabilitySpec => ({ approvalClass: null, ...s });

/**
 * The canonical registry. Every capability maps to exactly one PUBLIC application
 * service of an upstream bounded context. No entry has `sideEffect: "external"`:
 * external side effects are out of scope this sprint and are rejected upstream.
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
];

const BY_KEY = new Map(CAPABILITY_REGISTRY.map((c) => [c.key, c]));

export function getCapability(key: string): CapabilitySpec | undefined { return BY_KEY.get(key); }
export function isKnownCapability(key: string): boolean { return BY_KEY.has(key); }
export function listCapabilities(): readonly CapabilitySpec[] { return CAPABILITY_REGISTRY; }
export function capabilityRequiresApproval(key: string): boolean { return BY_KEY.get(key)?.approval === "required"; }
export function capabilityApprovalClass(key: string): ApprovalClass | null { return BY_KEY.get(key)?.approvalClass ?? null; }
/** A capability is invocable by an agent iff it is known AND not external. */
export function isInvocableCapability(key: string): boolean { const c = BY_KEY.get(key); return c !== undefined && c.sideEffect !== "external"; }
