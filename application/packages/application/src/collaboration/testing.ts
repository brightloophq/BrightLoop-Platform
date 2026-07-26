/* =============================================================================
 * In-memory Collaboration repositories (Phase D · D7) — TEST SUPPORT.
 *
 * A faithful in-memory implementation of the five collaboration ports: append-
 * only notifications/mentions, optimistic-concurrency inbox writes, user-owned
 * subscriptions, and insert/delete read receipts. No io.
 * ========================================================================== */

import { ok, type CollaborationRepositories, type RuntimeResult } from "@brightloop/domain";
import type { CollabNotification, InboxItem, Mention, ReadReceipt, Subscription } from "@brightloop/schema";

const conflict = (): RuntimeResult<never> => ({ ok: false, code: "conflict", message: "version mismatch", detail: null });

export function createInMemoryCollaborationRepos(): CollaborationRepositories {
  const subscriptions = new Map<string, Subscription>();
  const mentions: Mention[] = [];
  const notifications = new Map<string, CollabNotification>();
  const inbox = new Map<string, InboxItem>();
  const readReceipts: ReadReceipt[] = [];

  return {
    subscriptions: {
      create: async (s) => { subscriptions.set(s.id, s); return ok("created", s); },
      remove: async (id) => { subscriptions.delete(id); return ok("updated", null); },
      getById: async (id) => ok("found", subscriptions.get(id) ?? null),
      listByUser: async (uid) => ok("found", [...subscriptions.values()].filter((s) => s.userId === uid)),
      listByWorkspace: async (wid) => ok("found", [...subscriptions.values()].filter((s) => s.workspaceId === wid)),
    },
    mentions: {
      append: async (m) => { mentions.push(m); return ok("created", m); },
      listBySubject: async (sid) => ok("found", mentions.filter((m) => m.subjectId === sid)),
      listByUser: async (uid) => ok("found", mentions.filter((m) => m.mentionedUserId === uid)),
    },
    notifications: {
      append: async (n) => { notifications.set(n.id, n); return ok("created", n); },
      getById: async (id) => ok("found", notifications.get(id) ?? null),
      listByWorkspace: async (wid) => ok("found", [...notifications.values()].filter((n) => n.workspaceId === wid)),
    },
    inbox: {
      create: async (i) => { inbox.set(i.id, i); return ok("created", i); },
      getById: async (id) => ok("found", inbox.get(id) ?? null),
      listByUser: async (uid) => ok("found", [...inbox.values()].filter((i) => i.userId === uid)),
      save: async (next, expected) => { const cur = inbox.get(next.id); if (!cur || cur.version !== expected) return conflict(); inbox.set(next.id, next); return ok("updated", next); },
    },
    readReceipts: {
      create: async (r) => { readReceipts.push(r); return ok("created", r); },
      removeByEntity: async (uid, et, eid) => { for (let i = readReceipts.length - 1; i >= 0; i -= 1) { const r = readReceipts[i]!; if (r.userId === uid && r.entityType === et && r.entityId === eid) readReceipts.splice(i, 1); } return ok("updated", null); },
      listByUser: async (uid) => ok("found", readReceipts.filter((r) => r.userId === uid)),
    },
  };
}
