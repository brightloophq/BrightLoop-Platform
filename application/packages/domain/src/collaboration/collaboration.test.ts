/* =============================================================================
 * Collaboration domain tests (Phase D · Sprint D7).
 *
 * Subscription dedup, mention parsing/resolution (invalid + self-mention),
 * deterministic notification fan-out (never self-notify), inbox state machine,
 * read receipts, and the activity-feed filter/pagination — all pure.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { InboxItem, Subscription, TransformationActivity } from "@brightloop/schema";
import { buildSubscription, isDuplicateSubscription, subscriberIds } from "./subscription.js";
import { parseMentionHandles, resolveMentions } from "./mention.js";
import { generateNotifications, notificationTypeForActivity } from "./notification.js";
import { archiveInbox, canTransitionInbox, dismissInbox, markInboxRead, markInboxUnread, transitionInbox, unreadCount } from "./inbox.js";
import { hasReadReceipt } from "./read-receipt.js";
import { filterFeed, pageFeed } from "./feed.js";

const T0 = "2026-07-26T00:00:00.000Z";

/* ---- subscriptions --------------------------------------------------------- */
describe("subscriptions", () => {
  const sub = (userId: string, targetType: Subscription["targetType"], targetId: string): Subscription => buildSubscription({ id: `sub_${userId}_${targetId}`, userId, workspaceId: "txw", clientId: "cli", targetType, targetId, now: T0 });

  it("detects duplicate subscriptions", () => {
    const existing = [sub("u1", "initiative", "init_1")];
    expect(isDuplicateSubscription(existing, "u1", "initiative", "init_1")).toBe(true);
    expect(isDuplicateSubscription(existing, "u1", "initiative", "init_2")).toBe(false);
    expect(isDuplicateSubscription(existing, "u2", "initiative", "init_1")).toBe(false);
  });

  it("resolves subscriber ids for a target", () => {
    const existing = [sub("u1", "initiative", "init_1"), sub("u2", "initiative", "init_1"), sub("u3", "task", "t1")];
    expect(subscriberIds(existing, "initiative", "init_1").sort()).toEqual(["u1", "u2"]);
    expect(subscriberIds(existing, "task", "t1")).toEqual(["u3"]);
  });
});

/* ---- mentions -------------------------------------------------------------- */
describe("mentions", () => {
  it("parses unique @handles in order", () => {
    expect(parseMentionHandles("hey @alice and @bob, cc @alice")).toEqual(["alice", "bob"]);
    expect(parseMentionHandles("no mentions here")).toEqual([]);
  });

  it("resolves against a roster, dropping invalid handles and the author (self-mention)", () => {
    const roster = new Map([["alice", "u_alice"], ["bob", "u_bob"]]);
    expect(resolveMentions("@alice @bob @ghost", roster, "u_carol")).toEqual(["u_alice", "u_bob"]);
    expect(resolveMentions("@alice @bob", roster, "u_alice")).toEqual(["u_bob"]); // self-mention filtered
  });
});

/* ---- notifications --------------------------------------------------------- */
describe("notification engine", () => {
  it("maps activity types to notification buckets", () => {
    expect(notificationTypeForActivity("review_approved")).toBe("review");
    expect(notificationTypeForActivity("task_assigned")).toBe("assignment");
    expect(notificationTypeForActivity("task_completed")).toBe("task");
    expect(notificationTypeForActivity("timeline_started")).toBe("timeline");
    expect(notificationTypeForActivity("milestone_missed")).toBe("timeline");
    expect(notificationTypeForActivity("kpi_updated")).toBe("kpi");
    expect(notificationTypeForActivity("workspace_health_calculated")).toBe("health");
    expect(notificationTypeForActivity("workspace_created")).toBeNull();
  });

  it("fans out one notification + one unread inbox item per recipient, never to the actor", () => {
    const out = generateNotifications({
      type: "task", workspaceId: "txw", clientId: "cli", subjectType: "task", subjectId: "t1",
      summary: "Task completed", actorUserId: "u_actor", recipientUserIds: ["u1", "u2", "u_actor", "u1"],
      sourceActivityId: "act_1", now: T0, idFor: (kind, uid) => `${kind}_${uid}`,
    });
    expect(out.notifications.map((n) => n.recipientUserId).sort()).toEqual(["u1", "u2"]);
    expect(out.inboxItems.every((i) => i.status === "unread")).toBe(true);
    expect(out.inboxItems).toHaveLength(2);
  });
});

/* ---- inbox ----------------------------------------------------------------- */
describe("inbox state machine", () => {
  const item = (status: InboxItem["status"]): InboxItem => ({ id: "in_1", userId: "u1", workspaceId: "txw", clientId: "cli", notificationId: "n_1", status, version: 1, createdAt: T0, updatedAt: T0 });

  it("enforces the full legal transition matrix; archived + dismissed are terminal", () => {
    // legal moves out of unread / read
    for (const to of ["read", "archived", "dismissed"] as const) expect(canTransitionInbox("unread", to)).toBe(true);
    for (const to of ["unread", "archived", "dismissed"] as const) expect(canTransitionInbox("read", to)).toBe(true);
    // archived is terminal: no move back, and cannot become dismissed
    for (const to of ["unread", "read", "dismissed"] as const) expect(canTransitionInbox("archived", to)).toBe(false);
    // dismissed is terminal: no move back, and cannot become archived
    for (const to of ["unread", "read", "archived"] as const) expect(canTransitionInbox("dismissed", to)).toBe(false);
  });

  it("transitions bump version + stamp updatedAt", () => {
    const read = markInboxRead(item("unread"), "2026-07-26T01:00:00.000Z");
    expect(read.ok && read.value.status).toBe("read");
    expect(read.ok && read.value.version).toBe(2);
    expect(read.ok && read.value.updatedAt).toBe("2026-07-26T01:00:00.000Z");
    expect(markInboxUnread(item("read"), T0).ok).toBe(true);
    expect(archiveInbox(item("unread"), T0).ok).toBe(true);
    expect(dismissInbox(item("read"), T0).ok).toBe(true);
    expect(transitionInbox(item("dismissed"), "read", T0).ok).toBe(false);
  });

  it("counts unread items", () => {
    expect(unreadCount([item("unread"), item("read"), item("unread")])).toBe(2);
  });
});

/* ---- read receipts --------------------------------------------------------- */
describe("read receipts", () => {
  it("detects an existing receipt", () => {
    const existing = [{ id: "rr_1", userId: "u1", entityType: "mention" as const, entityId: "m_1", readAt: T0 }];
    expect(hasReadReceipt(existing, "u1", "mention", "m_1")).toBe(true);
    expect(hasReadReceipt(existing, "u1", "mention", "m_2")).toBe(false);
  });
});

/* ---- feed ------------------------------------------------------------------ */
describe("activity feed", () => {
  const act = (id: string, over: Partial<TransformationActivity> = {}): TransformationActivity => ({ id, workspaceId: "txw", clientId: "cli", type: "task_created", subjectType: "task", subjectId: "t1", summary: id, commandId: id, actorId: null, at: `2026-07-26T00:00:0${id.slice(-1)}.000Z`, ...over });

  const feed = [act("a1", { actorId: "u1", subjectId: "t1" }), act("a2", { actorId: "u2", subjectId: "t2", type: "review_approved", subjectType: "review" }), act("a3", { actorId: "u1", subjectId: "t1" })];

  it("filters by subject, actor, type, and date window", () => {
    expect(filterFeed(feed, { subjectId: "t1" }).map((a) => a.id).sort()).toEqual(["a1", "a3"]);
    expect(filterFeed(feed, { actorId: "u2" }).map((a) => a.id)).toEqual(["a2"]);
    expect(filterFeed(feed, { type: "review_approved" }).map((a) => a.id)).toEqual(["a2"]);
    expect(filterFeed(feed, { since: "2026-07-26T00:00:02.000Z" }).map((a) => a.id)).toEqual(["a2", "a3"]);
  });

  it("paginates newest-first with a stable cursor", () => {
    const p1 = pageFeed(feed, {}, 2);
    expect(p1.items.map((a) => a.id)).toEqual(["a3", "a2"]);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = pageFeed(feed, {}, 2, p1.nextCursor);
    expect(p2.items.map((a) => a.id)).toEqual(["a1"]);
    expect(p2.nextCursor).toBeNull();
  });
});
