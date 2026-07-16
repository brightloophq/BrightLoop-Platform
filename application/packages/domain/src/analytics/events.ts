/* =============================================================================
 * Analytics event taxonomy (handoff §12 §25).
 *
 * Naming: domain.object.action. Common props: { userId?, clientId?, role?, ts,
 * source }. Rule: NO PII in event names or props.
 *
 * Financial/state-changing events are emitted SERVER-SIDE so Admin Analytics is
 * real, not client-inferred. The mapping from a state transition to its event
 * name lives here, so there is one place that decides "this move is worth
 * counting".
 * ========================================================================== */

import type { MachineName } from "@brightloop/schema";

/** The canonical event names we emit. Extend as surfaces grow. */
export const ANALYTICS_EVENTS = [
  // funnel
  "assessment.start",
  "assessment.complete",
  "configurator.estimate.view",
  "conversation.start",
  // sales / state truth (each mirrors a guarded transition)
  "lead.stage.change",
  "proposal.accept",
  "proposal.change_request",
  "quote.sent",
  "quote.viewed",
  "quote.accepted",
  "quote.rejected",
  "quote.revision_requested",
  "quote.converted",
  "contract.sign",
  "contract.countersign",
  "payment.succeed",
  "payment.fail",
  "invoice.pay",
  "activation.complete",
  // delivery
  "project.status.change",
  "milestone.status.change",
  "deliverable.approve",
  "deliverable.revision_request",
  // reputation / marketing
  "portfolio.publish",
  "review.moderate",
  // ops
  "automation.run",
  "automation.fail",
  // auth
  "auth.password_recovered",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

/**
 * Map a state transition to its analytics event name, or null if the move is not
 * one we count. Keeping this pure and centralised means the transition service
 * doesn't hardcode event names, and the "what's worth an event" decision is
 * reviewable in one place.
 */
export function eventForTransition(
  machine: MachineName,
  to: string,
): AnalyticsEventName | null {
  switch (machine) {
    case "lead":
      return "lead.stage.change";
    case "project":
      return "project.status.change";
    case "milestone":
      return "milestone.status.change";
    case "deliverable":
      if (to === "approved") return "deliverable.approve";
      if (to === "revision_requested") return "deliverable.revision_request";
      return null;
    case "proposal":
      if (to === "accepted") return "proposal.accept";
      if (to === "change_requested") return "proposal.change_request";
      return null;
    case "quote":
      if (to === "sent") return "quote.sent";
      if (to === "viewed") return "quote.viewed";
      if (to === "accepted") return "quote.accepted";
      if (to === "rejected") return "quote.rejected";
      if (to === "revision_requested") return "quote.revision_requested";
      if (to === "converted") return "quote.converted";
      return null;
    case "contract":
      if (to === "signed_client") return "contract.sign";
      if (to === "countersigned") return "contract.countersign";
      return null;
    case "payment":
      if (to === "succeeded") return "payment.succeed";
      if (to === "failed") return "payment.fail";
      return null;
    case "invoice":
      if (to === "paid") return "invoice.pay";
      return null;
    case "clientLifecycle":
      if (to === "client_active") return "activation.complete";
      return null;
    case "automation":
      if (to === "running") return "automation.run";
      if (to === "failed") return "automation.fail";
      return null;
    default:
      return null;
  }
}

export interface AnalyticsEventInput {
  name: AnalyticsEventName;
  actorId?: string | null;
  clientId?: string | null;
  role?: string | null;
  /** Non-PII props only. */
  props?: Record<string, string | number | boolean | null>;
  source?: "server" | "client";
}
