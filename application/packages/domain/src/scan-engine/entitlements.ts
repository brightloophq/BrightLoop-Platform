/* =============================================================================
 * Scan engine — ENTITLEMENT PORT (interface + pure default policy).
 *
 * Entitlement decides what a requester may SEE/DO with a scan (report gating,
 * proposal generation). It is deliberately decoupled from billing: the port can
 * later consume a subscription, a deposit/payment, a manual approval, or an
 * engagement status. NO payment logic is implemented in this task.
 * ========================================================================== */

import type { EntitlementTier, ReportEntitlement } from "@brightloop/schema";

/** The signals an entitlement decision may consume (all optional, resolved later). */
export interface EntitlementContext {
  tier: EntitlementTier;
  hasActiveSubscription?: boolean;
  hasClearedDeposit?: boolean;
  manuallyApproved?: boolean;
  engagementActive?: boolean;
}

/** The port. A future adapter resolves the context from billing/CRM; the policy
 *  turns context → ReportEntitlement. Internal proposal tools are capability-gated
 *  elsewhere (assertCapability), NOT here. */
export interface EntitlementPolicy {
  resolve(ctx: EntitlementContext): ReportEntitlement;
}

/**
 * Default, pure entitlement policy — the current product rules. Conservative:
 * anything below committed_client sees a teaser; proposals are internal-only.
 * Replace/extend when billing lands, without touching call sites.
 */
export const defaultEntitlementPolicy: EntitlementPolicy = {
  resolve(ctx: EntitlementContext): ReportEntitlement {
    const committed =
      ctx.tier === "committed_client" &&
      Boolean(ctx.hasActiveSubscription || ctx.hasClearedDeposit || ctx.manuallyApproved || ctx.engagementActive);
    const internal = ctx.tier === "internal_operator" || ctx.tier === "admin_owner";
    const full = internal || committed;

    return {
      tier: ctx.tier,
      canViewIndex: ctx.tier !== "public_preview" || true, // the headline Index is the public teaser
      canViewDomainDetail: ctx.tier !== "public_preview",
      canViewEvidence: full,
      canViewCompetitors: full,
      canGenerateProposal: internal, // proposal engine is an internal operator tool
      redactedDomains: [],
    };
  },
};
