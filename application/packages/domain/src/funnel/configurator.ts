/* =============================================================================
 * Package Configurator — selection + Keep/Improve/Replace/Create resolution.
 * Ported from onboarding-data.js (configure / selectionOf / statusFor /
 * contribution / assetPresence).
 *
 * ESTIMATE, NOT A QUOTE. Everything here produces an indicative RANGE for the
 * prospect's own planning. The BINDING price is built by a human admin in the
 * discovery chat (Sprint 5C) — this never commits anyone to a number.
 * ========================================================================== */

import {
  DISCIPLINE_ORDER,
  type ModuleContent,
  type ServiceModule,
} from "@brightloop/schema";
import { rangeFor } from "../catalog/pricing.js";

/** What the client says about a service, and what BrightLoop will do about it. */
export type Choice = "have" | "upgrade" | "need";
export type ResolvedStatus = "Keep" | "Improve" | "Replace" | "Create";

/** Inventory value for a capability the client may own. */
export type AssetPresence = "have" | "weak" | "none";

/** Resolve a choice + inventory into what BrightLoop will actually do. */
export function statusFor(choice: Choice, inventory: AssetPresence): ResolvedStatus {
  if (choice === "have") return "Keep";
  if (choice === "need") return "Create";
  // upgrade: nothing to upgrade → Create; a weak asset → Replace; else Improve
  if (inventory === "none") return "Create";
  if (inventory === "weak") return "Replace";
  return "Improve";
}

/** How present are a module's required assets in the client's inventory? */
export function assetPresence(
  module: ServiceModule,
  inventory: Record<string, AssetPresence>,
): AssetPresence {
  const vals = module.assets.map((a) => inventory[a] ?? "none");
  if (module.assets.length > 0 && vals.every((v) => v === "have")) return "have";
  if (vals.some((v) => v === "have" || v === "weak")) return "weak";
  return "none";
}

/** Default choice from what the client already has. */
export function defaultChoice(
  module: ServiceModule,
  inventory: Record<string, AssetPresence>,
): Choice {
  const p = assetPresence(module, inventory);
  return p === "have" ? "have" : p === "weak" ? "upgrade" : "need";
}

/**
 * Cost contribution of a module given its resolved status.
 * Keep costs nothing; the rest are fractions of the full build range.
 */
export function contribution(
  module: ServiceModule,
  content: ModuleContent | null,
  status: ResolvedStatus,
): readonly [number, number] {
  const [lo, hi] = rangeFor(module, content);
  switch (status) {
    case "Keep":
      return [0, 0];
    case "Improve":
      return [Math.round(lo * 0.45), Math.round(hi * 0.6)];
    case "Replace":
      return [Math.round(lo * 0.7), Math.round(hi * 0.85)];
    case "Create":
      return [lo, hi];
  }
}

export interface SelectionRow {
  module: ServiceModule;
  choice: Choice;
  status: ResolvedStatus;
  cost: readonly [number, number];
}

export interface SelectionResult {
  rows: SelectionRow[];
  /** Rows that involve billable work (status !== Keep). */
  active: SelectionRow[];
  /** Rows kept as-is. */
  kept: SelectionRow[];
  /** Total INDICATIVE estimate range (never a quote). */
  low: number;
  high: number;
  /** Estimated saving from what the client already has. */
  savedLow: number;
  savedHigh: number;
}

export interface SelectionInput {
  /** Selected module ids (from the plan + any added). */
  moduleIds: readonly string[];
  /** module id → the client's choice; falls back to defaultChoice. */
  choices?: Record<string, Choice>;
  /** asset key → presence. */
  inventory?: Record<string, AssetPresence>;
}

/**
 * Resolve a configured selection into rows + an indicative estimate range.
 * De-dups owned assets: a module the client already has (Keep) contributes 0 and
 * counts toward "saved".
 */
export function resolveSelection(
  modules: readonly ServiceModule[],
  contentFor: (id: string) => ModuleContent | null,
  input: SelectionInput,
): SelectionResult {
  const inventory = input.inventory ?? {};
  const choices = input.choices ?? {};
  const byId = new Map(modules.map((m) => [m.id, m]));

  const rows: SelectionRow[] = [];
  for (const id of new Set(input.moduleIds)) {
    const module = byId.get(id);
    if (!module || module.upgrade) continue; // upgrades are alternatives, not additive
    const choice = choices[id] ?? defaultChoice(module, inventory);
    const status = statusFor(choice, assetPresence(module, inventory));
    rows.push({ module, choice, status, cost: contribution(module, contentFor(id), status) });
  }

  rows.sort(
    (a, b) => DISCIPLINE_ORDER[a.module.stage] - DISCIPLINE_ORDER[b.module.stage] || a.module.from - b.module.from,
  );

  let low = 0;
  let high = 0;
  let savedLow = 0;
  let savedHigh = 0;
  for (const r of rows) {
    low += r.cost[0];
    high += r.cost[1];
    if (r.status === "Keep") {
      const [rl, rh] = rangeFor(r.module, contentFor(r.module.id));
      savedLow += rl;
      savedHigh += rh;
    }
  }

  return {
    rows,
    active: rows.filter((r) => r.status !== "Keep"),
    kept: rows.filter((r) => r.status === "Keep"),
    low,
    high,
    savedLow,
    savedHigh,
  };
}

/**
 * Recommend a plan id from assessment scores + goal (rule-based, Decision G — no
 * LLM). Auditable and cannot fabricate.
 */
export function recommendPlan(scores: Record<string, number>, goalId: string): string {
  const values = Object.values(scores);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  if (goalId === "launch" || avg < 40) return "foundation";
  if (goalId === "scale" || avg >= 72) return "partner";
  if (goalId === "automate" || avg < 60) return "launch";
  return "transform";
}
