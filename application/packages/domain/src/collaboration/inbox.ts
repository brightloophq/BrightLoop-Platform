/* =============================================================================
 * Inbox state machine (Phase D · Sprint D7) — PURE.
 *
 *   unread ⇄ read              (mark read / mark unread)
 *   unread | read → archived   (terminal)
 *   unread | read → dismissed  (terminal)
 * `archived` and `dismissed` are BOTH terminal: neither transitions back, and
 * one cannot become the other. Transitions bump `version` (optimistic
 * concurrency) and stamp `updatedAt`.
 * ========================================================================== */

import type { InboxItem, InboxStatus } from "@brightloop/schema";

export const INBOX_TRANSITIONS: Record<InboxStatus, readonly InboxStatus[]> = {
  unread: ["read", "archived", "dismissed"],
  read: ["unread", "archived", "dismissed"],
  archived: [],
  dismissed: [],
};

export function canTransitionInbox(from: InboxStatus, to: InboxStatus): boolean {
  return INBOX_TRANSITIONS[from].includes(to);
}

export type InboxTransitionOutcome = { ok: true; value: InboxItem } | { ok: false; reason: "illegal_transition" };

/** Move an inbox item to `to` (pure). No-op transitions are the caller's concern. */
export function transitionInbox(item: InboxItem, to: InboxStatus, now: string): InboxTransitionOutcome {
  if (!canTransitionInbox(item.status, to)) return { ok: false, reason: "illegal_transition" };
  return { ok: true, value: { ...item, status: to, version: item.version + 1, updatedAt: now } };
}

export const markInboxRead = (item: InboxItem, now: string): InboxTransitionOutcome => transitionInbox(item, "read", now);
export const markInboxUnread = (item: InboxItem, now: string): InboxTransitionOutcome => transitionInbox(item, "unread", now);
export const archiveInbox = (item: InboxItem, now: string): InboxTransitionOutcome => transitionInbox(item, "archived", now);
export const dismissInbox = (item: InboxItem, now: string): InboxTransitionOutcome => transitionInbox(item, "dismissed", now);

/** Count unread items (pure). */
export function unreadCount(items: readonly InboxItem[]): number {
  return items.filter((i) => i.status === "unread").length;
}
