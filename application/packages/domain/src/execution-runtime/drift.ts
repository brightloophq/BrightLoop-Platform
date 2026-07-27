/* =============================================================================
 * Execution Runtime — drift detection (Phase F · Sprint F3). PURE.
 *
 * Compares Auxion's expected deployment baseline against a provider workflow
 * snapshot and classifies the difference. Destructive drift in production is never
 * auto-corrected — a reconciliation result is produced and an explicit decision
 * required. No io.
 * ========================================================================== */

import type { DriftClass } from "@brightloop/schema";

export interface ExpectedBaseline {
  translatedWorkflowHash: string;
  workflowName: string;
  active: boolean;
  nodeCount: number;
  connectionCount: number;
}

export interface ProviderSnapshot {
  /** null ⇒ the provider workflow is missing entirely. */
  workflowHash: string | null;
  workflowName: string | null;
  active: boolean | null;
  nodeCount: number | null;
  connectionCount: number | null;
}

export interface DriftResult {
  driftClass: DriftClass;
  changed: string[];
  /** Destructive drift in production must NOT be auto-overwritten. */
  requiresDecision: boolean;
}

/** Classify drift between the expected baseline and a provider snapshot. */
export function classifyDrift(expected: ExpectedBaseline, snapshot: ProviderSnapshot): DriftResult {
  if (snapshot.workflowHash === null) return { driftClass: "missing_provider_workflow", changed: ["workflow"], requiresDecision: true };

  const changed: string[] = [];
  if (snapshot.workflowHash !== expected.translatedWorkflowHash) changed.push("hash");
  if (snapshot.workflowName !== null && snapshot.workflowName !== expected.workflowName) changed.push("name");
  if (snapshot.active !== null && snapshot.active !== expected.active) changed.push("activation");
  const structural =
    (snapshot.nodeCount !== null && snapshot.nodeCount !== expected.nodeCount) ||
    (snapshot.connectionCount !== null && snapshot.connectionCount !== expected.connectionCount);
  if (structural) changed.push("structure");

  if (changed.length === 0) return { driftClass: "no_drift", changed, requiresDecision: false };
  // Fewer nodes/connections than expected, or a hash change with structural loss ⇒ destructive.
  const destructive = structural &&
    ((snapshot.nodeCount ?? expected.nodeCount) < expected.nodeCount ||
     (snapshot.connectionCount ?? expected.connectionCount) < expected.connectionCount);
  if (destructive) return { driftClass: "destructive_drift", changed, requiresDecision: true };
  if (structural || changed.includes("hash")) return { driftClass: "configuration_drift", changed, requiresDecision: true };
  return { driftClass: "metadata_drift", changed, requiresDecision: false };
}
