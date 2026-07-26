/* =============================================================================
 * In-memory Automation Builder repositories (Phase E · Sprint E5) — TEST SUPPORT.
 *
 * The execution intent is versioned (optimistic concurrency); the automation plan
 * + all definition records + versions + feedback are append-only. E1–E4 + Phase D
 * doubles come from their own testing modules — the builder reaches them only via
 * app services.
 * ========================================================================== */

import { ok, type AutomationBuilderRepositories, type RuntimeResult } from "@brightloop/domain";
import type {
  ActionDefinition, AutomationFeedback, AutomationPlan, AutomationVersion, ConditionDefinition, DeploymentPackage,
  ExecutionIntent, IntegrationBinding, TriggerDefinition, VariableDefinition, WorkflowDefinition, WorkflowStep,
} from "@brightloop/schema";

const conflict = (): RuntimeResult<never> => ({ ok: false, code: "conflict", message: "version mismatch", detail: null });

export function createInMemoryAutomationBuilderRepos(): AutomationBuilderRepositories {
  const intents = new Map<string, ExecutionIntent>();
  const plans = new Map<string, AutomationPlan>(); // keyed by executionIntentId
  const workflows = new Map<string, WorkflowDefinition>(); // keyed by id
  const steps: WorkflowStep[] = [];
  const triggers: TriggerDefinition[] = [];
  const actions: ActionDefinition[] = [];
  const conditions: ConditionDefinition[] = [];
  const variables: VariableDefinition[] = [];
  const integrations: IntegrationBinding[] = [];
  const deployments: DeploymentPackage[] = [];
  const versions: AutomationVersion[] = [];
  const feedback: AutomationFeedback[] = [];

  return {
    intents: {
      create: async (i) => { intents.set(i.id, i); return ok("created", i); },
      getById: async (id) => ok("found", intents.get(id) ?? null),
      listByWorkspace: async (wid) => ok("found", [...intents.values()].filter((i) => i.workspaceId === wid)),
      save: async (next, expected) => { const cur = intents.get(next.id); if (!cur || cur.version !== expected) return conflict(); intents.set(next.id, next); return ok("updated", next); },
    },
    plans: {
      append: async (p) => { plans.set(p.executionIntentId, p); return ok("created", p); },
      getByIntent: async (iid) => ok("found", plans.get(iid) ?? null),
      save: async (next) => { plans.set(next.executionIntentId, next); return ok("updated", next); },
    },
    workflows: {
      append: async (w) => { workflows.set(w.id, w); return ok("created", w); },
      getById: async (id) => ok("found", workflows.get(id) ?? null),
      listByIntent: async (iid) => ok("found", [...workflows.values()].filter((w) => w.executionIntentId === iid)),
      listByWorkspace: async (wid) => ok("found", [...workflows.values()].filter((w) => w.workspaceId === wid)),
      save: async (next) => { workflows.set(next.id, next); return ok("updated", next); },
    },
    steps: { appendMany: async (r) => { steps.push(...r); return ok("created", [...r]); }, listByWorkflow: async (wid) => ok("found", steps.filter((x) => x.workflowDefinitionId === wid)) },
    triggers: { appendMany: async (r) => { triggers.push(...r); return ok("created", [...r]); }, listByWorkflow: async (wid) => ok("found", triggers.filter((x) => x.workflowDefinitionId === wid)) },
    actions: { appendMany: async (r) => { actions.push(...r); return ok("created", [...r]); }, listByWorkflow: async (wid) => ok("found", actions.filter((x) => x.workflowDefinitionId === wid)) },
    conditions: { appendMany: async (r) => { conditions.push(...r); return ok("created", [...r]); }, listByWorkflow: async (wid) => ok("found", conditions.filter((x) => x.workflowDefinitionId === wid)) },
    variables: { appendMany: async (r) => { variables.push(...r); return ok("created", [...r]); }, listByWorkflow: async (wid) => ok("found", variables.filter((x) => x.workflowDefinitionId === wid)) },
    integrations: { appendMany: async (r) => { integrations.push(...r); return ok("created", [...r]); }, listByWorkflow: async (wid) => ok("found", integrations.filter((x) => x.workflowDefinitionId === wid)), listByWorkspace: async (wid) => ok("found", integrations.filter((x) => x.workspaceId === wid)) },
    deployments: { append: async (d) => { deployments.push(d); return ok("created", d); }, listByIntent: async (iid) => ok("found", deployments.filter((x) => x.executionIntentId === iid)), listByWorkspace: async (wid) => ok("found", deployments.filter((x) => x.workspaceId === wid)) },
    versions: { append: async (v) => { versions.push(v); return ok("created", v); }, listByWorkflow: async (wid) => ok("found", versions.filter((x) => x.workflowDefinitionId === wid)) },
    feedback: { append: async (f) => { feedback.push(f); return ok("created", f); }, listByIntent: async (iid) => ok("found", feedback.filter((x) => x.executionIntentId === iid)) },
  };
}
