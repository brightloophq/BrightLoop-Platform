/* =============================================================================
 * Communication connectors — canonical Auxion event vocabulary (F4.3). PURE.
 *
 * Provider event/message shapes are translated into these normalized types inside
 * the adapters and NEVER leak outward. Used by each binding's poll translator.
 * ========================================================================== */

import type { CanonicalConnectorEvent } from "@brightloop/domain";

export const COMM_EVENTS = {
  messageCreated: "communication.message.created",
  messageReplied: "communication.message.replied",
  messageUpdated: "communication.message.updated",
  messageDeleted: "communication.message.deleted",
  channelUpdated: "communication.channel.updated",
  memberJoined: "communication.member.joined",
} as const;

export interface NormalizedMessage {
  externalId: string;
  type: typeof COMM_EVENTS.messageCreated | typeof COMM_EVENTS.messageReplied;
  occurredAt: string;
  channelId: string;
  authorId: string;
}

/** Build a canonical connector event from a normalized message. */
export function messageEvent(m: NormalizedMessage, provenance: string): CanonicalConnectorEvent {
  return {
    type: m.type,
    externalId: m.externalId,
    occurredAt: m.occurredAt,
    payload: { channelId: m.channelId, authorId: m.authorId },
    provenance,
  };
}
