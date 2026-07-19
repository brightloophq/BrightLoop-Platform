/* =============================================================================
 * Freshness scoring (PDF 27 §08) — PURE.
 *
 * Classifies an observation's age into Fresh / Recent / Stale / Expired against
 * configurable day thresholds, and returns a decayed 0–1 freshness weight.
 * Age is computed from a supplied `now` (no clock). Deterministic.
 * ========================================================================== */

import type { Freshness, FreshnessBand } from "@brightloop/schema";

export interface FreshnessThresholds {
  freshDays: number; // ≤ → fresh
  recentDays: number; // ≤ → recent
  staleDays: number; // ≤ → stale; beyond → expired
}

export const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds = { freshDays: 1, recentDays: 7, staleDays: 30 };

/** Decayed weight per band — a coarse, deterministic decay. */
const BAND_SCORE: Record<FreshnessBand, number> = { fresh: 1, recent: 0.75, stale: 0.4, expired: 0.1 };

const MS_PER_DAY = 86_400_000;

/** Whole-day age of `timestamp` at `now` (0 when in the future). Deterministic. */
export function ageInDays(timestamp: string, now: string): number {
  const diff = Date.parse(now) - Date.parse(timestamp);
  return diff <= 0 ? 0 : Math.floor(diff / MS_PER_DAY);
}

export function freshnessBand(ageDays: number | null, thresholds: FreshnessThresholds = DEFAULT_FRESHNESS_THRESHOLDS): FreshnessBand {
  if (ageDays === null) return "expired"; // unknown age is treated as worst-case
  if (ageDays <= thresholds.freshDays) return "fresh";
  if (ageDays <= thresholds.recentDays) return "recent";
  if (ageDays <= thresholds.staleDays) return "stale";
  return "expired";
}

export function freshnessScore(band: FreshnessBand): number {
  return BAND_SCORE[band];
}

/** Full freshness for a timestamp at `now`. */
export function computeFreshness(timestamp: string, now: string, thresholds: FreshnessThresholds = DEFAULT_FRESHNESS_THRESHOLDS): Freshness {
  const ageDays = Number.isNaN(Date.parse(timestamp)) ? null : ageInDays(timestamp, now);
  const band = freshnessBand(ageDays, thresholds);
  return { ageDays, band, score: freshnessScore(band) };
}
