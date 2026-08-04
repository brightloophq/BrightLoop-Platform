/* =============================================================================
 * Billing — SUBSCRIPTION LIFECYCLE (F5). Pure + deterministic.
 *
 * Transition legality is delegated to the registered `subscription` state
 * machine in @brightloop/schema (mirrored by the DB `state_transitions` guard);
 * this module wraps it and adds the period / trial / grace DATE math. Every
 * function takes its clock as an ISO string — no `Date.now()`.
 * ========================================================================== */

import {
  can,
  isTerminal,
  nextStates,
  type BillingInterval,
  type SubscriptionStatus,
} from "@brightloop/schema";

/** Legal subscription transition? Delegates to the `subscription` machine. */
export function canTransitionSubscription(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return can("subscription", from, to);
}

/** States reachable from `from`. */
export function subscriptionNextStates(from: SubscriptionStatus): readonly string[] {
  return nextStates("subscription", from);
}

/** Is a subscription status terminal (no exits)? */
export function isSubscriptionTerminal(status: SubscriptionStatus): boolean {
  return isTerminal("subscription", status);
}

/* -----------------------------------------------------------------------------
 * Deterministic date math (UTC, month-end clamped). All inputs are ISO instants.
 * -------------------------------------------------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000;

function daysInMonth(year: number, monthZeroBased: number): number {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
}

/** Add `days` to an ISO instant. Pure. */
export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}

/** Add `months` to an ISO instant, clamping the day to the target month's length. */
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const day = Math.min(d.getUTCDate(), daysInMonth(targetYear, targetMonth));
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  ).toISOString();
}

/** Add one billing interval to an ISO instant. `none` returns the input unchanged. */
export function addInterval(iso: string, interval: BillingInterval): string {
  switch (interval) {
    case "month":
      return addMonths(iso, 1);
    case "year":
      return addMonths(iso, 12);
    case "none":
      return iso;
  }
}

/** The billing period that starts at `startAt` for a given interval. */
export interface BillingPeriod {
  startAt: string;
  endAt: string;
}

/**
 * Compute the period beginning at `startAt`. A non-recurring (`none`) plan has
 * no period end (`endAt === startAt` sentinel — callers treat it as open).
 */
export function computePeriod(startAt: string, interval: BillingInterval): BillingPeriod {
  return { startAt, endAt: addInterval(startAt, interval) };
}

/** Trial end = start + trialDays. Null when the plan has no trial. */
export function computeTrialEnd(startAt: string, trialDays: number): string | null {
  return trialDays > 0 ? addDays(startAt, trialDays) : null;
}

/** Grace (dunning) window end = failure instant + graceDays. */
export function computeGraceEnd(failedAt: string, graceDays: number): string {
  return addDays(failedAt, graceDays);
}

/** Has instant `at` reached-or-passed the (nullable) deadline? Null deadline = never. */
export function hasReached(at: string, deadline: string | null): boolean {
  if (deadline === null) return false;
  return at >= deadline;
}

/** Whole days between two ISO instants (b − a), floored. Negative if b precedes a. */
export function daysBetweenIso(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / DAY_MS);
}

/** Default dunning grace window (days) before a past-due subscription lapses. */
export const DEFAULT_GRACE_DAYS = 7 as const;

/** Default payment-retry schedule (days after the initial failure). */
export const PAYMENT_RETRY_OFFSETS_DAYS: readonly number[] = Object.freeze([1, 3, 5]);

/**
 * The next retry instant for a failed payment given the attempt count (1-based),
 * or null when the retry schedule is exhausted (→ subscription should lapse).
 */
export function nextRetryAt(failedAt: string, attempt: number): string | null {
  const offset = PAYMENT_RETRY_OFFSETS_DAYS[attempt - 1];
  if (offset === undefined) return null;
  return addDays(failedAt, offset);
}
