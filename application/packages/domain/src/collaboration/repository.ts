/* =============================================================================
 * Collaboration — REPOSITORY PORTS (Phase D · Sprint D7).
 *
 * The persistence contracts for the collaboration bounded context. Ports only —
 * Supabase adapters live in `@brightloop/data`. Every method returns a
 * `RuntimeResult`. RLS remains the tenant boundary; adapters add no filters.
 * Notifications + mentions are append-only facts; inbox items are mutable state
 * under optimistic concurrency; read receipts are insert/delete.
 * ========================================================================== */

import type { CollabNotification, InboxItem, Mention, ReadReceipt, Subscription } from "@brightloop/schema";
import type { RuntimeResult } from "../runtime/results.js";

export interface SubscriptionRepository {
  create(subscription: Subscription): Promise<RuntimeResult<Subscription>>;
  remove(id: string): Promise<RuntimeResult<null>>;
  getById(id: string): Promise<RuntimeResult<Subscription | null>>;
  listByUser(userId: string): Promise<RuntimeResult<Subscription[]>>;
  /** Every subscription in a workspace — the recipient-resolution set for events. */
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<Subscription[]>>;
}

export interface MentionRepository {
  /** Append one immutable mention record. */
  append(mention: Mention): Promise<RuntimeResult<Mention>>;
  listBySubject(subjectId: string): Promise<RuntimeResult<Mention[]>>;
  listByUser(mentionedUserId: string): Promise<RuntimeResult<Mention[]>>;
}

export interface NotificationRepository {
  /** Append one immutable notification fact. */
  append(notification: CollabNotification): Promise<RuntimeResult<CollabNotification>>;
  getById(id: string): Promise<RuntimeResult<CollabNotification | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<CollabNotification[]>>;
}

export interface InboxRepository {
  create(item: InboxItem): Promise<RuntimeResult<InboxItem>>;
  getById(id: string): Promise<RuntimeResult<InboxItem | null>>;
  listByUser(userId: string): Promise<RuntimeResult<InboxItem[]>>;
  /** Optimistic-concurrency status write; a version mismatch returns `conflict`. */
  save(next: InboxItem, expectedVersion: number): Promise<RuntimeResult<InboxItem>>;
}

export interface ReadReceiptRepository {
  create(receipt: ReadReceipt): Promise<RuntimeResult<ReadReceipt>>;
  /** Delete the receipt for `(user, entity)` — mark-unread. Idempotent. */
  removeByEntity(userId: string, entityType: ReadReceipt["entityType"], entityId: string): Promise<RuntimeResult<null>>;
  listByUser(userId: string): Promise<RuntimeResult<ReadReceipt[]>>;
}

/** The ports the collaboration application use-cases are wired with. */
export interface CollaborationRepositories {
  subscriptions: SubscriptionRepository;
  mentions: MentionRepository;
  notifications: NotificationRepository;
  inbox: InboxRepository;
  readReceipts: ReadReceiptRepository;
}
