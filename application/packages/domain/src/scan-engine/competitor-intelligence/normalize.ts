/* =============================================================================
 * Benchmark normalization (Sprint 10 §8 · AIS-005 §05) — PURE.
 *
 * Standardizes dimensions before comparison so no unit dominates by scale. Handles
 * higher/lower-is-better, categorical, ordinal, and binary metrics, plus population
 * statistics (median, percentile, min/max) and outlier policy (clamp / winsorize).
 *
 * An UNAVAILABLE value returns null — it is never converted into a neutral score,
 * a zero, or a category median (AIS-005 §06 missing-benchmark handling).
 * No live dataset access: populations are caller-supplied.
 * ========================================================================== */

import type { NormalizationPolicy, PopulationStats } from "@brightloop/schema";

/** Ascending copy of the finite values only. Pure. */
function sortedFinite(values: readonly (number | null)[]): number[] {
  return values.filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
}

/** Median of a population (null when empty). Pure. */
export function median(values: readonly (number | null)[]): number | null {
  const s = sortedFinite(values);
  if (s.length === 0) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Population statistics over the available values only. Pure. */
export function populationStats(values: readonly (number | null)[]): PopulationStats {
  const s = sortedFinite(values);
  if (s.length === 0) return { count: 0, min: null, max: null, median: null, mean: null, stdDev: null };
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const variance = s.reduce((acc, v) => acc + (v - mean) ** 2, 0) / s.length;
  return { count: s.length, min: s[0]!, max: s[s.length - 1]!, median: median(s), mean, stdDev: Math.sqrt(variance) };
}

/**
 * Percentile rank of `value` within `population`, 0–100 — the share of the
 * population at or below it. Null when the population is empty or the value is
 * unavailable. Pure.
 */
export function percentileRank(value: number | null, population: readonly (number | null)[]): number | null {
  if (value === null) return null;
  const s = sortedFinite(population);
  if (s.length === 0) return null;
  const atOrBelow = s.filter((v) => v <= value).length;
  return Math.round((atOrBelow / s.length) * 100);
}

/** Winsorize a population at the given tail fraction (both tails). Pure. */
export function winsorize(values: readonly number[], fraction: number): number[] {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0 || fraction <= 0) return s;
  const k = Math.floor(s.length * fraction);
  if (k === 0) return s;
  const lo = s[k]!;
  const hi = s[s.length - 1 - k]!;
  return s.map((v) => Math.min(hi, Math.max(lo, v)));
}

/** Apply the policy's outlier treatment to a population. Pure. */
export function applyOutlierPolicy(values: readonly (number | null)[], policy: NormalizationPolicy): number[] {
  const s = sortedFinite(values);
  if (policy.outlierPolicy === "winsorize") return winsorize(s, policy.winsorFraction);
  if (policy.outlierPolicy === "clamp_min_max" && policy.min !== null && policy.max !== null) {
    return s.map((v) => Math.min(policy.max!, Math.max(policy.min!, v)));
  }
  return s;
}

/**
 * Normalize a raw value to 0–100 under the policy.
 * Returns **null** when the value is unavailable, or when the policy cannot
 * produce a defensible score (e.g. no range, unknown category) — never a default.
 */
export function normalizeValue(value: number | string | null, policy: NormalizationPolicy, population: readonly (number | null)[] = []): number | null {
  if (value === null) return null; // unavailable — never neutralized

  switch (policy.direction) {
    case "binary": {
      const n = typeof value === "number" ? value : policy.ordinalScale.indexOf(value);
      if (typeof value === "string" && n < 0) return null;
      return (typeof value === "number" ? value : n) > 0 ? 100 : 0;
    }
    case "categorical":
    case "ordinal": {
      if (policy.ordinalScale.length === 0) return null;
      const idx = typeof value === "string" ? policy.ordinalScale.indexOf(value) : Math.round(value);
      if (idx < 0 || idx >= policy.ordinalScale.length) return null; // unknown category
      if (policy.ordinalScale.length === 1) return 100;
      return Math.round((idx / (policy.ordinalScale.length - 1)) * 100);
    }
    case "higher_is_better":
    case "lower_is_better": {
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      const pool = applyOutlierPolicy(population, policy);
      const min = policy.min ?? (pool.length > 0 ? pool[0]! : null);
      const max = policy.max ?? (pool.length > 0 ? pool[pool.length - 1]! : null);
      if (min === null || max === null) return null; // no defensible range
      if (max === min) return 100;
      const clamped = Math.min(max, Math.max(min, value));
      const ratio = (clamped - min) / (max - min);
      return Math.round((policy.direction === "higher_is_better" ? ratio : 1 - ratio) * 100);
    }
  }
}

/**
 * Standardized distance from the set benchmark (AIS-005 §05):
 *   Position = (client − benchmark) / σ
 * Null when either side or σ is unavailable. Pure.
 */
export function relativePosition(clientValue: number | null, population: readonly (number | null)[]): number | null {
  if (clientValue === null) return null;
  const stats = populationStats(population);
  if (stats.mean === null || stats.stdDev === null || stats.stdDev === 0) return null;
  return (clientValue - stats.mean) / stats.stdDev;
}
