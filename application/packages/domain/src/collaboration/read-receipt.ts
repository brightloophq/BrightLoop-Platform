/* =============================================================================
 * Read receipts (Phase D · Sprint D7) — PURE.
 *
 * A generic per-user, per-entity read marker: `(reader, entity) → readAt`.
 * `markRead` builds the receipt; `markUnread` is modelled as the receipt's
 * absence (the application deletes it). At most one receipt per (user, entity).
 * ========================================================================== */

import type { ReadReceipt, ReadReceiptEntityType } from "@brightloop/schema";

export interface BuildReadReceiptInput {
  id: string;
  userId: string;
  entityType: ReadReceiptEntityType;
  entityId: string;
  now: string;
}

/** Build a read receipt (pure). */
export function buildReadReceipt(input: BuildReadReceiptInput): ReadReceipt {
  return { id: input.id, userId: input.userId, entityType: input.entityType, entityId: input.entityId, readAt: input.now };
}

/** Has `user` read `(entityType, entityId)` in `existing`? Pure. */
export function hasReadReceipt(existing: readonly ReadReceipt[], userId: string, entityType: ReadReceiptEntityType, entityId: string): boolean {
  return existing.some((r) => r.userId === userId && r.entityType === entityType && r.entityId === entityId);
}
