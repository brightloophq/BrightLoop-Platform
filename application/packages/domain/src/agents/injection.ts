/* =============================================================================
 * Prompt-injection defense + instruction classification (Phase E · Sprint E7).
 *
 * PURE. Separates instruction sources by trust and enforces that lower-trust text
 * (retrieved evidence, external content, agent messages) can NEVER override
 * higher-trust policy (system, security, authorization, approval, capability).
 * Retrieved content is treated as untrusted DATA — it is classified, scanned, and
 * marked, never executed. Capability selection, scope, and approvals come from
 * system policy + mission limits, never from evidence text. No io.
 * ========================================================================== */

import type { InstructionClass } from "@brightloop/schema";

/** Trust precedence — higher index = LOWER trust. Policy (0) always wins. */
export const INSTRUCTION_PRECEDENCE: readonly InstructionClass[] = [
  "system_policy", "mission_instruction", "user_instruction", "agent_message", "retrieved_evidence", "external_content",
];

function rank(cls: InstructionClass): number {
  const i = INSTRUCTION_PRECEDENCE.indexOf(cls);
  return i === -1 ? INSTRUCTION_PRECEDENCE.length : i;
}

/** True iff `a` outranks (is more trusted than) `b`. */
export function outranks(a: InstructionClass, b: InstructionClass): boolean {
  return rank(a) < rank(b);
}

/** Lower-trust classes that must NEVER influence policy/authorization/approval. */
export function isUntrusted(cls: InstructionClass): boolean {
  return cls === "retrieved_evidence" || cls === "external_content" || cls === "agent_message";
}

const INJECTION_PATTERNS: readonly { signal: string; re: RegExp }[] = [
  { signal: "override_instructions", re: /\b(ignore|disregard|forget|override)\b.{0,30}\b(previous|prior|above|system|instructions?|rules?|policy)\b/i },
  { signal: "role_change", re: /\byou are now\b|\bact as\b.{0,20}\b(admin|owner|root|system)\b|\bchange (your )?role\b/i },
  { signal: "enable_capability", re: /\b(enable|allow|grant|unlock)\b.{0,30}\b(capabilit|permission|admin|tool|access)/i },
  { signal: "bypass_approval", re: /\b(bypass|skip|without|no need for)\b.{0,20}\bapprovals?\b/i },
  { signal: "change_scope", re: /\b(cross|other|all)[- ]?workspace|\bswitch (to )?workspace\b|\btenant\b.{0,20}\b(bypass|ignore)\b/i },
  { signal: "exfiltrate_secret", re: /\b(api[_ ]?key|secret|token|password|credential|env(ironment)? variable)\b/i },
  { signal: "external_action", re: /\b(curl|fetch|http:\/\/|https:\/\/|POST |GET |send (an )?email|webhook|exec|shell|os\.system)\b/i },
];

export interface InjectionScan { flagged: boolean; signals: string[] }

/** Scan untrusted text for injection attempts. Returns matched signal names. */
export function scanForInjection(text: string): InjectionScan {
  const signals = INJECTION_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.signal);
  return { flagged: signals.length > 0, signals: [...new Set(signals)] };
}

export interface SanitizedEvidence { text: string; flagged: boolean; signals: string[] }

/**
 * Sanitize a piece of retrieved/external content: it is wrapped as inert data and,
 * if injection signals are present, marked so downstream consumers treat it as
 * untrusted. Sanitization NEVER executes or obeys the content.
 */
export function sanitizeRetrievedText(text: string): SanitizedEvidence {
  const scan = scanForInjection(text);
  return { text: text.slice(0, 20_000), flagged: scan.flagged, signals: scan.signals };
}

export interface CapabilityGuardInput {
  requestedCapabilityKey: string;
  allowedCapabilities: readonly string[];
  prohibitedCapabilities: readonly string[];
  /** The trust class of whatever SUGGESTED this capability. */
  sourceClass: InstructionClass;
  isKnown: boolean;
}

export interface CapabilityGuardResult { allowed: boolean; reason: string }

/**
 * The structural guarantee: a capability may proceed ONLY if it is a known
 * registry key, is allow-listed, is not prohibited, and — critically — was NOT
 * selected on the authority of untrusted content. Evidence can inform WHAT to
 * look at, never WHICH privileged capability to run.
 */
export function guardCapabilitySelection(input: CapabilityGuardInput): CapabilityGuardResult {
  if (!input.isKnown) return { allowed: false, reason: "unknown capability (not in registry)" };
  if (isUntrusted(input.sourceClass)) return { allowed: false, reason: `capability selection from untrusted source (${input.sourceClass})` };
  if (input.prohibitedCapabilities.includes(input.requestedCapabilityKey)) return { allowed: false, reason: "capability is prohibited by policy" };
  if (input.allowedCapabilities.length > 0 && !input.allowedCapabilities.includes(input.requestedCapabilityKey)) return { allowed: false, reason: "capability not in the allow-list" };
  return { allowed: true, reason: "ok" };
}
