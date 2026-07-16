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

/**
 * The price-free shape of a module. This is all the CLIENT ever needs to
 * configure a package: which modules exist, what they're called, their stage,
 * and the assets they depend on. Deliberately omits `from`/pricing so no price
 * data reaches the prospect's browser (the internal pricing engine works from
 * the full ServiceModule, server-side only).
 */
export interface ConfigModule {
  id: string;
  name: string;
  stage: string;
  assets: readonly string[];
  upgrade?: boolean;
}

/** How present are a module's required assets in the client's inventory? */
export function assetPresence(
  module: { assets: readonly string[] },
  inventory: Record<string, AssetPresence>,
): AssetPresence {
  const vals = module.assets.map((a) => inventory[a] ?? "none");
  if (module.assets.length > 0 && vals.every((v) => v === "have")) return "have";
  if (vals.some((v) => v === "have" || v === "weak")) return "weak";
  return "none";
}

/** Default choice from what the client already has. */
export function defaultChoice(
  module: { assets: readonly string[] },
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

/* -------------------------------------------------------------------------- */
/* PRICE-FREE resolution — the CLIENT path                                    */
/* -------------------------------------------------------------------------- */

export interface ConfigRow {
  module: ConfigModule;
  choice: Choice;
  status: ResolvedStatus;
}
export interface ConfigResult {
  rows: ConfigRow[];
  /** Rows that involve billable work (status !== Keep). */
  active: ConfigRow[];
  /** Rows kept as-is. */
  kept: ConfigRow[];
}

const CONFIG_STAGE_ORDER: Record<string, number> = DISCIPLINE_ORDER as Record<string, number>;

/**
 * Resolve a configured selection into rows + Keep/Improve/Replace/Create status,
 * WITHOUT any cost. This is what the prospect's browser runs — it carries no
 * pricing logic or data. The internal estimate is computed separately, server
 * side, by `computeInternalEstimate`.
 */
export function resolveConfiguration(
  modules: readonly ConfigModule[],
  input: SelectionInput,
): ConfigResult {
  const inventory = input.inventory ?? {};
  const choices = input.choices ?? {};
  const byId = new Map(modules.map((m) => [m.id, m]));

  const rows: ConfigRow[] = [];
  for (const id of new Set(input.moduleIds)) {
    const module = byId.get(id);
    if (!module || module.upgrade) continue;
    const choice = choices[id] ?? defaultChoice(module, inventory);
    const status = statusFor(choice, assetPresence(module, inventory));
    rows.push({ module, choice, status });
  }
  rows.sort((a, b) => (CONFIG_STAGE_ORDER[a.module.stage] ?? 0) - (CONFIG_STAGE_ORDER[b.module.stage] ?? 0));

  return {
    rows,
    active: rows.filter((r) => r.status !== "Keep"),
    kept: rows.filter((r) => r.status === "Keep"),
  };
}

/* -------------------------------------------------------------------------- */
/* INTERNAL pricing engine — the SERVER path (never sent to a prospect)       */
/* -------------------------------------------------------------------------- */

export interface InternalEstimate {
  /** Effort model: 1 point ≈ 1 estimated week of active work. */
  effortPoints: number;
  low: number;
  high: number;
  savedLow: number;
  savedHigh: number;
}

/**
 * Compute the internal effort + estimate for a selection. Runs ONLY on the
 * server against the fully-priced catalog; the result is stored in the
 * internal-only `pricing_estimates` table and shown to admins, never prospects.
 */
export function computeInternalEstimate(
  modules: readonly ServiceModule[],
  contentFor: (id: string) => ModuleContent | null,
  input: SelectionInput,
): InternalEstimate {
  const sel = resolveSelection(modules, contentFor, input);
  const effortPoints = sel.active.reduce((sum, r) => sum + (r.module.weeks?.[1] ?? r.module.weeks?.[0] ?? 0), 0);
  return { effortPoints, low: sel.low, high: sel.high, savedLow: sel.savedLow, savedHigh: sel.savedHigh };
}

/**
 * Recommend a plan id from assessment scores + goal (rule-based, Decision G — no
 * LLM). Auditable and cannot fabricate.
 */
export function recommendPlan(scores: Record<string, number>, goalId: string): string {
  const values = Object.values(scores);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  // Three tiers (Starter / Growth / Enterprise). Rule-based, Decision G — no LLM.
  if (goalId === "scale" || avg >= 70) return "enterprise";
  if (goalId === "launch" || avg < 45) return "starter";
  return "growth";
}
