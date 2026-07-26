/* =============================================================================
 * Supabase Collaboration repositories (Phase D · Sprint D7).
 *
 * Production adapters for the five collaboration ports. Constructed per request
 * with the caller's RLS-scoped session — no tenant filters here; RLS + the
 * application capability check are the gates. Mirrors the execution adapters'
 * untyped-cast pattern; the mappers are the type-safe boundary.
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollabNotification, InboxItem, Mention, ReadReceipt, Subscription } from "@brightloop/schema";
import {
  err,
  mapDatabaseError,
  ok,
  type InboxRepository,
  type MentionRepository,
  type NotificationRepository,
  type ReadReceiptRepository,
  type RuntimeResult,
  type SubscriptionRepository,
} from "@brightloop/domain";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import * as m from "./mappers.js";

const SUB = "collaboration_subscription";
const MEN = "collaboration_mention";
const NOTIF = "collaboration_notification";
const INBOX = "collaboration_inbox_item";
const RR = "collaboration_read_receipt";

export class SupabaseSubscriptionRepository implements SubscriptionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(subscription: Subscription): Promise<RuntimeResult<Subscription>> {
    const { data, error } = await this.db.from(SUB).insert(m.subscriptionRow(subscription)).select("*").single();
    if (error) return mapDatabaseError(error, "subscription.create");
    return ok("created", m.toSubscription(data as Record<string, unknown>));
  }
  async remove(id: string): Promise<RuntimeResult<null>> {
    const { error } = await this.db.from(SUB).delete().eq("id", id);
    if (error) return mapDatabaseError(error, "subscription.remove");
    return ok("updated", null);
  }
  async getById(id: string): Promise<RuntimeResult<Subscription | null>> {
    const { data, error } = await this.db.from(SUB).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "subscription.getById");
    return ok("found", data ? m.toSubscription(data as Record<string, unknown>) : null);
  }
  async listByUser(userId: string): Promise<RuntimeResult<Subscription[]>> {
    const { data, error } = await this.db.from(SUB).select("*").eq("user_id", userId).order("created_at", { ascending: true });
    if (error) return mapDatabaseError(error, "subscription.listByUser");
    return ok("found", (data ?? []).map((r) => m.toSubscription(r as Record<string, unknown>)));
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<Subscription[]>> {
    const { data, error } = await this.db.from(SUB).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: true });
    if (error) return mapDatabaseError(error, "subscription.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toSubscription(r as Record<string, unknown>)));
  }
}

export class SupabaseMentionRepository implements MentionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(mention: Mention): Promise<RuntimeResult<Mention>> {
    const { data, error } = await this.db.from(MEN).insert(m.mentionRow(mention)).select("*").single();
    if (error) return mapDatabaseError(error, "mention.append");
    return ok("created", m.toMention(data as Record<string, unknown>));
  }
  async listBySubject(subjectId: string): Promise<RuntimeResult<Mention[]>> {
    const { data, error } = await this.db.from(MEN).select("*").eq("subject_id", subjectId).order("created_at", { ascending: true });
    if (error) return mapDatabaseError(error, "mention.listBySubject");
    return ok("found", (data ?? []).map((r) => m.toMention(r as Record<string, unknown>)));
  }
  async listByUser(mentionedUserId: string): Promise<RuntimeResult<Mention[]>> {
    const { data, error } = await this.db.from(MEN).select("*").eq("mentioned_user_id", mentionedUserId).order("created_at", { ascending: true });
    if (error) return mapDatabaseError(error, "mention.listByUser");
    return ok("found", (data ?? []).map((r) => m.toMention(r as Record<string, unknown>)));
  }
}

export class SupabaseNotificationRepository implements NotificationRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(notification: CollabNotification): Promise<RuntimeResult<CollabNotification>> {
    const { data, error } = await this.db.from(NOTIF).insert(m.notificationRow(notification)).select("*").single();
    if (error) return mapDatabaseError(error, "notification.append");
    return ok("created", m.toNotification(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<CollabNotification | null>> {
    const { data, error } = await this.db.from(NOTIF).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "notification.getById");
    return ok("found", data ? m.toNotification(data as Record<string, unknown>) : null);
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<CollabNotification[]>> {
    const { data, error } = await this.db.from(NOTIF).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "notification.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toNotification(r as Record<string, unknown>)));
  }
}

export class SupabaseInboxRepository implements InboxRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(item: InboxItem): Promise<RuntimeResult<InboxItem>> {
    const { data, error } = await this.db.from(INBOX).insert(m.inboxItemRow(item)).select("*").single();
    if (error) return mapDatabaseError(error, "inbox.create");
    return ok("created", m.toInboxItem(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<InboxItem | null>> {
    const { data, error } = await this.db.from(INBOX).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "inbox.getById");
    return ok("found", data ? m.toInboxItem(data as Record<string, unknown>) : null);
  }
  async listByUser(userId: string): Promise<RuntimeResult<InboxItem[]>> {
    const { data, error } = await this.db.from(INBOX).select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "inbox.listByUser");
    return ok("found", (data ?? []).map((r) => m.toInboxItem(r as Record<string, unknown>)));
  }
  async save(next: InboxItem, expectedVersion: number): Promise<RuntimeResult<InboxItem>> {
    const { data, error } = await this.db.from(INBOX).update({ status: next.status, version: next.version, updated_at: next.updatedAt }).eq("id", next.id).eq("version", expectedVersion).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "inbox.save");
    if (data === null) return err("conflict", "inbox.save: version mismatch");
    return ok("updated", m.toInboxItem(data as Record<string, unknown>));
  }
}

export class SupabaseReadReceiptRepository implements ReadReceiptRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(receipt: ReadReceipt): Promise<RuntimeResult<ReadReceipt>> {
    const { data, error } = await this.db.from(RR).insert(m.readReceiptRow(receipt)).select("*").single();
    if (error) return mapDatabaseError(error, "readReceipt.create");
    return ok("created", m.toReadReceipt(data as Record<string, unknown>));
  }
  async removeByEntity(userId: string, entityType: ReadReceipt["entityType"], entityId: string): Promise<RuntimeResult<null>> {
    const { error } = await this.db.from(RR).delete().eq("user_id", userId).eq("entity_type", entityType).eq("entity_id", entityId);
    if (error) return mapDatabaseError(error, "readReceipt.removeByEntity");
    return ok("updated", null);
  }
  async listByUser(userId: string): Promise<RuntimeResult<ReadReceipt[]>> {
    const { data, error } = await this.db.from(RR).select("*").eq("user_id", userId).order("read_at", { ascending: false });
    if (error) return mapDatabaseError(error, "readReceipt.listByUser");
    return ok("found", (data ?? []).map((r) => m.toReadReceipt(r as Record<string, unknown>)));
  }
}
