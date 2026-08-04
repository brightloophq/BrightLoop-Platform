/* =============================================================================
 * Billing — USAGE METERING & DETERMINISTIC AGGREGATION (F5).
 *
 * Raw usage events are an append-only ledger; aggregation is a PURE fold over
 * them. Same events (in any order) → same totals. Meters are provider-neutral.
 * ========================================================================== */

import {
  usageMeterSchema,
  type BillingUsageEvent,
  type UsageMeter,
} from "@brightloop/schema";

const ALL_METERS = usageMeterSchema.options as readonly UsageMeter[];

/** Inclusive-start / exclusive-end period bounds (ISO instants). */
export interface UsageWindow {
  startAt: string;
  endAt: string;
}

/** Is `occurredAt` within [startAt, endAt)? A null-bounded window is open on that side. */
export function inWindow(occurredAt: string, window: UsageWindow | null): boolean {
  if (window === null) return true;
  return occurredAt >= window.startAt && occurredAt < window.endAt;
}

/**
 * Sum usage per meter across events, optionally bounded to a window. Returns a
 * total for EVERY meter (0 when absent), so downstream reads are total functions.
 * Order-independent and deterministic.
 */
export function aggregateUsage(
  events: readonly BillingUsageEvent[],
  window: UsageWindow | null = null,
): Record<UsageMeter, number> {
  const totals = {} as Record<UsageMeter, number>;
  for (const meter of ALL_METERS) totals[meter] = 0;
  for (const event of events) {
    if (!inWindow(event.occurredAt, window)) continue;
    totals[event.meter] = (totals[event.meter] ?? 0) + event.quantity;
  }
  return totals;
}

/** Sum a single meter across events within an optional window. Pure. */
export function usageForMeter(
  events: readonly BillingUsageEvent[],
  meter: UsageMeter,
  window: UsageWindow | null = null,
): number {
  let total = 0;
  for (const event of events) {
    if (event.meter !== meter) continue;
    if (!inWindow(event.occurredAt, window)) continue;
    total += event.quantity;
  }
  return total;
}

/** A per-meter usage line for presentation / invoicing. */
export interface UsageLine {
  meter: UsageMeter;
  used: number;
}

/** Deterministic, meter-ordered usage lines (stable output for tests + UI). */
export function usageLines(
  events: readonly BillingUsageEvent[],
  window: UsageWindow | null = null,
): UsageLine[] {
  const totals = aggregateUsage(events, window);
  return ALL_METERS.map((meter) => ({ meter, used: totals[meter] }));
}

/**
 * De-duplicate usage events by idempotency key, keeping the FIRST occurrence.
 * Replay-safe: re-ingesting the same event contributes nothing. Deterministic
 * (input order defines "first").
 */
export function dedupeUsageEvents(events: readonly BillingUsageEvent[]): BillingUsageEvent[] {
  const seen = new Set<string>();
  const out: BillingUsageEvent[] = [];
  for (const event of events) {
    if (seen.has(event.idempotencyKey)) continue;
    seen.add(event.idempotencyKey);
    out.push(event);
  }
  return out;
}
