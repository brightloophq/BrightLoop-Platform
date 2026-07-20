/* =============================================================================
 * Investment structure INPUTS (Sprint 11 §9) — PURE.
 *
 * This module deliberately computes NO price. It assembles only the inputs a
 * FUTURE pricing engine will consume: effort/duration bands, role mix, complexity,
 * dependency burden, risk-premium inputs, optionality, tier, and commercial
 * structure flags.
 *
 * There is no rate, total, subtotal, tax amount, discount amount, invoice, or
 * payment anywhere in this file. When the client supplied no budget it is marked
 * `budgetUnavailable` — never inferred.
 * ========================================================================== */

import {
  PROPOSAL_MODEL_VERSION,
  investmentStructureInputsSchema,
  type BudgetRange,
  type InvestmentStructureInputs,
  type ProposalQualifier,
  type ProposalRequest,
  type ProposalScopeItem,
  type ProposalWorkstream,
  type RiskBand,
} from "@brightloop/schema";

const RISK_RANK: Record<RiskBand, number> = { low: 0, moderate: 1, high: 2, critical: 3, unknown: 0 };
const RANK_RISK: RiskBand[] = ["low", "moderate", "high", "critical"];

/** The highest risk band across a set — delivery complexity. Pure. */
export function aggregateRiskBand(bands: readonly RiskBand[]): RiskBand {
  const known = bands.filter((b) => b !== "unknown");
  if (known.length === 0) return "unknown";
  return RANK_RISK[Math.max(...known.map((b) => RISK_RANK[b]))]!;
}

export interface InvestmentInputsInput {
  request: ProposalRequest;
  workstreams: readonly ProposalWorkstream[];
  scope: readonly ProposalScopeItem[];
  qualifiers?: readonly ProposalQualifier[];
  roleMix?: InvestmentStructureInputs["roleMix"];
  serviceTier?: InvestmentStructureInputs["serviceTier"];
  supportLevel?: InvestmentStructureInputs["supportLevel"];
  hasSetupComponent?: boolean;
  hasRecurringComponent?: boolean;
  discountEligibilityInputs?: string[];
  taxRegion?: string | null;
}

/**
 * Assemble the pricing-engine inputs. Deterministic. Emits `limitations` naming
 * exactly what a pricing engine still lacks — it never fills those gaps itself.
 */
export function buildInvestmentInputs(input: InvestmentInputsInput): InvestmentStructureInputs {
  const limitations: string[] = ["No price is calculated in this sprint; these are inputs to a future pricing engine only."];
  const budget: BudgetRange = input.request.budgetRange;
  const budgetUnavailable = !budget.provided;
  if (budgetUnavailable) limitations.push("Client supplied no budget; budget marked unavailable rather than inferred.");

  const workstreamEffortBands: Record<string, InvestmentStructureInputs["workstreamEffortBands"][string]> = {};
  const durationBands: Record<string, InvestmentStructureInputs["durationBands"][string]> = {};
  for (const w of [...input.workstreams].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    workstreamEffortBands[w.id] = w.effortBand;
    durationBands[w.id] = w.durationBand;
  }

  const optionality = input.scope.filter((s) => s.kind === "optional").map((s) => s.id).sort();
  const dependencyBurden = [...new Set(input.workstreams.flatMap((w) => w.dependencies))].length;
  const deliveryComplexity = aggregateRiskBand(input.scope.filter((s) => s.kind === "mandatory" || s.kind === "optional").map((s) => s.riskBand));

  const riskPremiumInputs = (input.qualifiers ?? [])
    .filter((q) => q.severity !== "unknown")
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((q) => ({ source: `${q.kind}:${q.id}`, band: q.severity }));

  if (input.roleMix === undefined) limitations.push("Role mix not supplied; a pricing engine will need it to compute cost.");
  if (input.request.budgetRange.currency === null) limitations.push("No currency supplied.");

  return investmentStructureInputsSchema.parse({
    workstreamEffortBands,
    roleMix: input.roleMix ?? [],
    durationBands,
    deliveryComplexity,
    dependencyBurden,
    riskPremiumInputs,
    optionality,
    supportLevel: input.supportLevel ?? "unspecified",
    serviceTier: input.serviceTier ?? "unspecified",
    hasSetupComponent: input.hasSetupComponent ?? false,
    hasRecurringComponent: input.hasRecurringComponent ?? false,
    milestonePaymentPreference: input.request.preferredPaymentStructure,
    depositRequired: false,
    currency: budget.currency,
    taxRegion: input.taxRegion ?? null,
    discountEligibilityInputs: input.discountEligibilityInputs ?? [],
    budgetUnavailable,
    limitations,
    modelVersion: PROPOSAL_MODEL_VERSION,
  });
}
