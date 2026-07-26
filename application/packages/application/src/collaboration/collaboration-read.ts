/* =============================================================================
 * Collaboration read models (Phase D · Sprint D7).
 *
 * Read-only projections: the workspace / initiative activity feed (filtered +
 * paginated over the existing append-only log), the per-user inbox (joined with
 * its notifications), unread counts, subscription summary, and notification
 * summary. Load-then-authorize; DTOs only.
 * ========================================================================== */

import { pageFeed, unreadCount, type FeedFilter } from "@brightloop/domain";
import {
  authorize,
  requireCollaboration,
  requireExecution,
  NOTIFICATION_READ_CAP,
  SUBSCRIPTION_READ_CAP,
  type AppContext,
} from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import {
  toFeedItemDTO,
  toInboxItemDTO,
  toSubscriptionDTO,
  type FeedPageDTO,
  type InboxItemDTO,
  type InboxSummaryDTO,
  type NotificationSummaryDTO,
  type SubscriptionSummaryDTO,
} from "./dto.js";

export interface FeedQuery extends FeedFilter {
  limit?: number;
  cursor?: string | null;
}

/** The workspace activity feed — filtered + paginated, newest first. */
export async function listFeed(ctx: AppContext, rawWorkspaceId: unknown, query: FeedQuery = {}): Promise<FeedPageDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const exec = requireExecution(ctx);
  const workspace = unwrap(await exec.workspaces.getById(workspaceId));
  if (workspace === null) throw new NotFoundError("transformation workspace");
  authorize(ctx.actor, NOTIFICATION_READ_CAP, workspace.clientId);

  const activities = unwrap(await exec.activities.listByWorkspace(workspaceId));
  const { limit = 25, cursor = null, ...filter } = query;
  const page = pageFeed(activities, filter, limit, cursor);
  return { items: page.items.map(toFeedItemDTO), nextCursor: page.nextCursor };
}

/** One initiative's feed — activities whose subject is that initiative. */
export async function listInitiativeFeed(ctx: AppContext, rawInitiativeId: unknown, query: FeedQuery = {}): Promise<FeedPageDTO> {
  const initiativeId = requireId(rawInitiativeId, "initiativeId");
  const exec = requireExecution(ctx);
  const initiative = unwrap(await exec.initiatives.getById(initiativeId));
  if (initiative === null) throw new NotFoundError("initiative");
  authorize(ctx.actor, NOTIFICATION_READ_CAP, initiative.clientId);

  const activities = unwrap(await exec.activities.listByWorkspace(initiative.workspaceId));
  const { limit = 25, cursor = null, ...filter } = query;
  const page = pageFeed(activities, { ...filter, subjectId: initiativeId }, limit, cursor);
  return { items: page.items.map(toFeedItemDTO), nextCursor: page.nextCursor };
}

/** Join a user's inbox items with their notifications. */
async function loadInbox(ctx: AppContext, status?: string): Promise<InboxItemDTO[]> {
  const collab = requireCollaboration(ctx);
  const items = unwrap(await collab.inbox.listByUser(ctx.actor.userId));
  const filtered = status === undefined ? items : items.filter((i) => i.status === status);
  const dtos: InboxItemDTO[] = [];
  for (const item of [...filtered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))) {
    const notification = unwrap(await collab.notifications.getById(item.notificationId));
    dtos.push(toInboxItemDTO(item, notification));
  }
  return dtos;
}

/** The caller's inbox, optionally filtered by status, with unread/total counts. */
export async function listInbox(ctx: AppContext, status?: "unread" | "read" | "archived" | "dismissed"): Promise<InboxSummaryDTO> {
  authorize(ctx.actor, NOTIFICATION_READ_CAP, null);
  const collab = requireCollaboration(ctx);
  const all = unwrap(await collab.inbox.listByUser(ctx.actor.userId));
  const items = await loadInbox(ctx, status);
  return { items, unread: unreadCount(all), total: all.length };
}

/** The caller's unread notification count (for the inbox badge). */
export async function getUnreadCount(ctx: AppContext): Promise<number> {
  authorize(ctx.actor, NOTIFICATION_READ_CAP, null);
  const collab = requireCollaboration(ctx);
  return unreadCount(unwrap(await collab.inbox.listByUser(ctx.actor.userId)));
}

/** The caller's notification summary: unread, total, and counts per bucket. */
export async function getNotificationSummary(ctx: AppContext): Promise<NotificationSummaryDTO> {
  authorize(ctx.actor, NOTIFICATION_READ_CAP, null);
  const collab = requireCollaboration(ctx);
  const items = unwrap(await collab.inbox.listByUser(ctx.actor.userId));
  const byType: Record<string, number> = {};
  for (const item of items) {
    if (item.status === "dismissed") continue;
    const notification = unwrap(await collab.notifications.getById(item.notificationId));
    if (notification === null) continue;
    byType[notification.type] = (byType[notification.type] ?? 0) + 1;
  }
  return { unread: unreadCount(items), total: items.length, byType };
}

/** The caller's subscriptions. */
export async function listSubscriptions(ctx: AppContext): Promise<SubscriptionSummaryDTO> {
  authorize(ctx.actor, SUBSCRIPTION_READ_CAP, null);
  const collab = requireCollaboration(ctx);
  const subs = unwrap(await collab.subscriptions.listByUser(ctx.actor.userId));
  return { subscriptions: [...subs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toSubscriptionDTO), count: subs.length };
}
