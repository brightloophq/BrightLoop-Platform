/* =============================================================================
 * Circuit breaker (PDF 27 §14 — provider fallback / isolation) — PURE.
 *
 * closed → (failures ≥ threshold) → open → (cooldown elapsed) → half_open →
 * (probe succeeds) → closed | (probe fails) → open. All transitions are pure
 * functions of the current circuit + a supplied `now` timestamp (no clock).
 * ========================================================================== */

import { circuitSchema, type Circuit, type CircuitConfig } from "@brightloop/schema";

/** A fresh, closed circuit for a provider. */
export function newCircuit(providerId: string): Circuit {
  return circuitSchema.parse({ providerId, state: "closed", failures: 0, openedAt: null, halfOpenSuccesses: 0 });
}

/** Record a failure. Trips to `open` once consecutive failures reach the threshold. */
export function recordFailure(circuit: Circuit, config: CircuitConfig, now: string): Circuit {
  // A failure during a half-open probe re-opens immediately.
  if (circuit.state === "half_open") {
    return { ...circuit, state: "open", failures: circuit.failures + 1, openedAt: now, halfOpenSuccesses: 0 };
  }
  const failures = circuit.failures + 1;
  if (failures >= config.failureThreshold) {
    return { ...circuit, state: "open", failures, openedAt: now, halfOpenSuccesses: 0 };
  }
  return { ...circuit, failures };
}

/** Record a success. Closes the circuit once enough half-open probes succeed. */
export function recordSuccess(circuit: Circuit, config: CircuitConfig): Circuit {
  if (circuit.state === "half_open") {
    const halfOpenSuccesses = circuit.halfOpenSuccesses + 1;
    if (halfOpenSuccesses >= config.halfOpenProbes) {
      return { ...circuit, state: "closed", failures: 0, openedAt: null, halfOpenSuccesses: 0 };
    }
    return { ...circuit, halfOpenSuccesses };
  }
  // Any success while closed clears the failure streak.
  return { ...circuit, state: "closed", failures: 0, openedAt: null, halfOpenSuccesses: 0 };
}

/**
 * Whether a request may be attempted now. An `open` circuit whose cooldown has
 * elapsed transitions to `half_open` (a single recovery probe is allowed).
 * Returns the (possibly transitioned) circuit + an `allowed` flag. Pure.
 */
export function attempt(circuit: Circuit, config: CircuitConfig, now: string): { circuit: Circuit; allowed: boolean } {
  if (circuit.state === "closed") return { circuit, allowed: true };
  if (circuit.state === "half_open") return { circuit, allowed: true }; // probe in flight
  // open: allow a probe once the cooldown has elapsed
  const openedMs = circuit.openedAt ? Date.parse(circuit.openedAt) : NaN;
  const elapsed = Number.isNaN(openedMs) ? Infinity : Date.parse(now) - openedMs;
  if (elapsed >= config.cooldownMs) {
    return { circuit: { ...circuit, state: "half_open", halfOpenSuccesses: 0 }, allowed: true };
  }
  return { circuit, allowed: false };
}

export function isOpen(circuit: Circuit): boolean {
  return circuit.state === "open";
}
