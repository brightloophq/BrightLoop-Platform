/* =============================================================================
 * CRM connectors — canonical Auxion CRM event vocabulary (F4.5). PURE.
 *
 * Provider event/webhook shapes (HubSpot `subscriptionType`, Pipedrive
 * `meta.action`+`meta.object`, Salesforce polled record deltas) are translated into
 * THESE normalized types inside the adapters and NEVER leak outward. Every CRM
 * connector emits the same vocabulary, so the Execution Runtime / Copilot / Audit
 * see one provider-neutral CRM event model.
 * ========================================================================== */

import type { CanonicalConnectorEvent } from "@brightloop/domain";

/** The canonical, provider-neutral CRM event types. */
export const CRM_EVENTS = {
  contactCreated: "crm.contact.created",
  contactUpdated: "crm.contact.updated",
  contactArchived: "crm.contact.archived",
  companyCreated: "crm.company.created",
  companyUpdated: "crm.company.updated",
  dealCreated: "crm.deal.created",
  dealUpdated: "crm.deal.updated",
  dealStageChanged: "crm.deal.stage_changed",
  dealWon: "crm.deal.won",
  dealLost: "crm.deal.lost",
  activityCreated: "crm.activity.created",
  noteCreated: "crm.note.created",
  /** A recognized provider event with no more specific canonical mapping. */
  eventReceived: "crm.event.received",
} as const;

export type CrmEventType = (typeof CRM_EVENTS)[keyof typeof CRM_EVENTS];

export interface NormalizedCrmEvent {
  type: CrmEventType;
  externalId: string;
  occurredAt: string;
  /** Bounded, provider-neutral payload — never raw provider body or secrets. */
  payload: Record<string, unknown>;
}

/** Build a canonical connector event from a normalized CRM event. */
export function crmEvent(e: NormalizedCrmEvent, provenance: string): CanonicalConnectorEvent {
  return { type: e.type, externalId: e.externalId, occurredAt: e.occurredAt, payload: e.payload, provenance };
}

/** Map a normalized entity kind + action onto a canonical CRM event type. */
export function eventTypeFor(entity: "contact" | "company" | "deal" | "activity" | "note", action: "created" | "updated" | "deleted" | "stage_changed" | "won" | "lost"): CrmEventType {
  if (entity === "contact") {
    if (action === "deleted") return CRM_EVENTS.contactArchived;
    return action === "created" ? CRM_EVENTS.contactCreated : CRM_EVENTS.contactUpdated;
  }
  if (entity === "company") return action === "created" ? CRM_EVENTS.companyCreated : CRM_EVENTS.companyUpdated;
  if (entity === "deal") {
    if (action === "won") return CRM_EVENTS.dealWon;
    if (action === "lost") return CRM_EVENTS.dealLost;
    if (action === "stage_changed") return CRM_EVENTS.dealStageChanged;
    return action === "created" ? CRM_EVENTS.dealCreated : CRM_EVENTS.dealUpdated;
  }
  if (entity === "activity") return CRM_EVENTS.activityCreated;
  if (entity === "note") return CRM_EVENTS.noteCreated;
  return CRM_EVENTS.eventReceived;
}
