/* =============================================================================
 * Mission guardrails + budgets (Phase E · Sprint E7) — PURE.
 *
 * Hard limits an agent mission must never exceed: runs, tasks, retries,
 * wall-clock, tokens, cost, and delegation depth. When any hard limit is reached
 * the mission MUST stop — no infinite loops, no uncontrolled recursive delegation.
 * No io.
 * ========================================================================== */

import type { MissionLimits } from "@brightloop/schema";

export interface MissionUsage {
  runCount: number;
  taskCount: number;
  retryCount: number;
  durationMs: number;
  tokenTotal: number;
  cost: number;
  delegationDepth: number;
}

export interface GuardrailViolation { limit: string; value: number; max: number }

/** Every hard limit currently exceeded (empty ⇒ within budget). */
export function guardrailViolations(limits: MissionLimits, usage: MissionUsage): GuardrailViolation[] {
  const v: GuardrailViolation[] = [];
  const chk = (name: string, value: number, max: number) => { if (value > max) v.push({ limit: name, value, max }); };
  chk("maxRuns", usage.runCount, limits.maxRuns);
  chk("maxTasks", usage.taskCount, limits.maxTasks);
  chk("maxRetries", usage.retryCount, limits.maxRetries);
  chk("maxDurationMs", usage.durationMs, limits.maxDurationMs);
  chk("maxTokens", usage.tokenTotal, limits.maxTokens);
  chk("maxCost", usage.cost, limits.maxCost);
  chk("maxDelegationDepth", usage.delegationDepth, limits.maxDelegationDepth);
  return v;
}

export function withinBudget(limits: MissionLimits, usage: MissionUsage): boolean {
  return guardrailViolations(limits, usage).length === 0;
}

/** The reason a mission must terminate now, or null if it may continue. */
export function terminationReason(limits: MissionLimits, usage: MissionUsage): string | null {
  const v = guardrailViolations(limits, usage);
  if (v.length === 0) return null;
  const first = v[0]!;
  return `hard limit reached: ${first.limit} (${first.value} > ${first.max})`;
}

/** A delegation may proceed only if it stays within the depth limit. */
export function canDelegate(nextDepth: number, limits: MissionLimits): boolean {
  return nextDepth <= limits.maxDelegationDepth;
}

/** Is a capability permitted by the mission's allow/deny policy? */
export function capabilityPermittedByLimits(key: string, limits: MissionLimits): boolean {
  if (limits.prohibitedCapabilities.includes(key)) return false;
  if (limits.allowedCapabilities.length > 0 && !limits.allowedCapabilities.includes(key)) return false;
  return true;
}
