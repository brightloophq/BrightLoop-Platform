/* =============================================================================
 * Activity Feed (Phase D · Sprint D7) — PURE projection over existing activity.
 *
 * The aggregate activity log already exists and is append-only; this is a
 * first-class feed over it: deterministic filter (workspace / subject / actor /
 * type / date window) + stable pagination. Never edits; read-only.
 * ========================================================================== */

import type { ActivitySubjectType, TransformationActivity, TransformationActivityType } from "@brightloop/schema";

export interface FeedFilter {
  /** Restrict to one subject (e.g. an initiative) by id. */
  subjectId?: string;
  subjectType?: ActivitySubjectType;
  /** Restrict to activities caused by a given user (null actors never match). */
  actorId?: string;
  type?: TransformationActivityType;
  /** Inclusive ISO lower / upper bounds on `at`. */
  since?: string;
  until?: string;
}

export interface FeedPage {
  items: TransformationActivity[];
  /** Opaque cursor (the last item's `at|id`) to pass as `after` for the next page. */
  nextCursor: string | null;
}

const cursorOf = (a: TransformationActivity): string => `${a.at}|${a.id}`;

/** Apply a feed filter. Pure — does not mutate the input array. */
export function filterFeed(activities: readonly TransformationActivity[], filter: FeedFilter): TransformationActivity[] {
  return activities.filter((a) => {
    if (filter.subjectId !== undefined && a.subjectId !== filter.subjectId) return false;
    if (filter.subjectType !== undefined && a.subjectType !== filter.subjectType) return false;
    if (filter.actorId !== undefined && a.actorId !== filter.actorId) return false;
    if (filter.type !== undefined && a.type !== filter.type) return false;
    if (filter.since !== undefined && a.at < filter.since) return false;
    if (filter.until !== undefined && a.at > filter.until) return false;
    return true;
  });
}

/**
 * Newest-first page of a feed. Sorts by `(at, id)` descending, drops everything
 * at-or-before an optional `after` cursor, then takes `limit`. Deterministic. Pure.
 */
export function pageFeed(activities: readonly TransformationActivity[], filter: FeedFilter, limit: number, after: string | null = null): FeedPage {
  const sorted = [...filterFeed(activities, filter)].sort((a, b) => (cursorOf(a) < cursorOf(b) ? 1 : cursorOf(a) > cursorOf(b) ? -1 : 0));
  const start = after === null ? 0 : sorted.findIndex((a) => cursorOf(a) === after) + 1;
  const from = after !== null && start === 0 ? sorted.length : start; // unknown cursor → empty tail
  const capped = Math.max(1, Math.min(limit, 200));
  const items = sorted.slice(from, from + capped);
  const nextCursor = from + capped < sorted.length && items.length > 0 ? cursorOf(items[items.length - 1]!) : null;
  return { items, nextCursor };
}
