/* =============================================================================
 * Automation Builder domain tests (Phase E · Sprint E5) — pure units.
 *
 * Lifecycle transitions, DAG graph (cycles / reachability / topological order),
 * the validation pipeline (every failure mode), and dry-run simulation.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { ActionDefinition, ConditionDefinition, IntegrationBinding, TriggerDefinition, VariableDefinition, WorkflowStep } from "@brightloop/schema";
import {
  canTransitionIntent, deploymentChecksum, hasWorkflowCycle, reachableFrom, simulateWorkflow, topologicalOrder,
  validateWorkflow, type GraphNode,
} from "./index.js";

const T0 = "2026-07-27T00:00:00.000Z";

function step(key: string, kind: WorkflowStep["kind"], next: string[], extra: Partial<WorkflowStep> = {}): WorkflowStep {
  return { id: `s_${key}`, workflowDefinitionId: "wf", executionIntentId: "ei", workspaceId: "ws", clientId: null, key, kind, name: key, nextStepKeys: next, conditionExpression: null, onErrorStepKey: null, retryMax: 0, timeoutMs: 0, refId: null, estimatedRuntimeMs: 1000, order: 0, createdAt: T0, ...extra };
}
const trigger = (): TriggerDefinition => ({ id: "t1", workflowDefinitionId: "wf", executionIntentId: "ei", workspaceId: "ws", clientId: null, kind: "manual", name: "Start", config: {}, createdAt: T0 });
const action = (extra: Partial<ActionDefinition> = {}): ActionDefinition => ({ id: "a1", workflowDefinitionId: "wf", executionIntentId: "ei", workspaceId: "ws", clientId: null, kind: "create_task", name: "Do", config: {}, integrationBindingId: null, createdAt: T0, ...extra });
const binding = (extra: Partial<IntegrationBinding> = {}): IntegrationBinding => ({ id: "b1", workflowDefinitionId: "wf", executionIntentId: "ei", workspaceId: "ws", clientId: null, provider: "crm", name: "CRM", capability: "upsert", config: {}, bound: true, createdAt: T0, ...extra });
const variable = (key: string, scope: VariableDefinition["scope"], extra: Partial<VariableDefinition> = {}): VariableDefinition => ({ id: `v_${key}`, workflowDefinitionId: "wf", executionIntentId: "ei", workspaceId: "ws", clientId: null, key, scope, type: "string", defaultValue: null, required: false, createdAt: T0, ...extra });

/** A minimal, VALID workflow: trigger → action(terminal), one output variable. */
function validWorkflow() {
  return {
    entryStepKey: "start",
    steps: [step("start", "trigger", ["do"]), step("do", "action", [])],
    triggers: [trigger()],
    actions: [action()],
    conditions: [] as ConditionDefinition[],
    variables: [variable("result", "output"), variable("workspace_id", "workspace")],
    integrations: [] as IntegrationBinding[],
  };
}

describe("intent lifecycle", () => {
  it("allows draft→building→built→published and blocks illegal jumps", () => {
    expect(canTransitionIntent("draft", "building")).toBe(true);
    expect(canTransitionIntent("building", "built")).toBe(true);
    expect(canTransitionIntent("built", "published")).toBe(true);
    expect(canTransitionIntent("draft", "published")).toBe(false);
    expect(canTransitionIntent("archived", "building")).toBe(false);
  });
});

describe("workflow graph", () => {
  const nodes: GraphNode[] = [
    { key: "a", nextStepKeys: ["b"] }, { key: "b", nextStepKeys: ["c"] }, { key: "c", nextStepKeys: [] }, { key: "orphan", nextStepKeys: [] },
  ];
  it("detects cycles", () => {
    expect(hasWorkflowCycle(nodes)).toBe(false);
    expect(hasWorkflowCycle([{ key: "a", nextStepKeys: ["b"] }, { key: "b", nextStepKeys: ["a"] }])).toBe(true);
  });
  it("computes reachability from an entry", () => {
    const r = reachableFrom(nodes, "a");
    expect([...r].sort()).toEqual(["a", "b", "c"]);
    expect(r.has("orphan")).toBe(false);
  });
  it("linearizes a DAG and returns null on a cycle", () => {
    expect(topologicalOrder(nodes, "a")).toEqual(["a", "b", "c"]);
    expect(topologicalOrder([{ key: "a", nextStepKeys: ["b"] }, { key: "b", nextStepKeys: ["a"] }], "a")).toBeNull();
  });
});

describe("validation pipeline", () => {
  it("passes a well-formed workflow", () => {
    const r = validateWorkflow(validWorkflow());
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });
  it("flags a cycle", () => {
    const w = validWorkflow();
    w.steps = [step("start", "trigger", ["do"]), step("do", "action", ["start"])];
    expect(validateWorkflow(w).issues).toContain("Workflow contains a cycle");
  });
  it("flags a missing trigger and missing action", () => {
    const r = validateWorkflow({ ...validWorkflow(), triggers: [], actions: [] });
    expect(r.issues).toContain("Workflow has no trigger");
    expect(r.issues).toContain("Workflow has no action");
  });
  it("flags unreachable nodes, unknown edges, and duplicate keys", () => {
    const w = validWorkflow();
    w.steps = [step("start", "trigger", ["do"]), step("do", "action", []), step("do", "action", ["ghost"]), step("island", "action", [])];
    const r = validateWorkflow(w);
    expect(r.issues.some((i) => i.includes("Duplicate step key"))).toBe(true);
    expect(r.issues.some((i) => i.includes("unknown step"))).toBe(true);
    expect(r.issues.some((i) => i.includes("Unreachable step"))).toBe(true);
  });
  it("flags unbound integrations and undefined variable references", () => {
    const w = validWorkflow();
    w.integrations = [binding({ bound: false })];
    w.actions = [action({ config: { to: "{{missing_var}}" } })];
    const r = validateWorkflow(w);
    expect(r.issues.some((i) => i.includes("not bound"))).toBe(true);
    expect(r.issues).toContain('Undefined variable reference "missing_var"');
  });
  it("flags dead branches", () => {
    const w = validWorkflow();
    w.steps = [step("start", "trigger", ["gate"]), step("gate", "condition", [])];
    expect(validateWorkflow(w).issues.some((i) => i.includes("dead branch"))).toBe(true);
  });
});

describe("simulation", () => {
  it("returns an execution order, outputs, and an estimated runtime", () => {
    const w = validWorkflow();
    const sim = simulateWorkflow({ entryStepKey: w.entryStepKey, steps: w.steps, conditions: w.conditions, variables: w.variables });
    expect(sim.ok).toBe(true);
    expect(sim.executionOrder).toEqual(["start", "do"]);
    expect(sim.estimatedRuntimeMs).toBe(2000);
    expect(sim.expectedOutputs.map((o) => o.key)).toContain("result");
  });
  it("warns when the graph cannot be linearized", () => {
    const sim = simulateWorkflow({ entryStepKey: "a", steps: [step("a", "trigger", ["b"]), step("b", "action", ["a"])], conditions: [], variables: [] });
    expect(sim.ok).toBe(false);
    expect(sim.warnings.length).toBeGreaterThan(0);
  });
});

describe("deployment checksum", () => {
  it("is deterministic and stable", () => {
    expect(deploymentChecksum("hello")).toBe(deploymentChecksum("hello"));
    expect(deploymentChecksum("a")).not.toBe(deploymentChecksum("b"));
  });
});
