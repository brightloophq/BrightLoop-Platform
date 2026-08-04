/* =============================================================================
 * Supabase Integration Platform repositories (F4.1).
 *
 * Eight adapters (untyped-cast pattern; mappers are the boundary). Installation,
 * secret reference and OAuth grant are versioned or mutable roots (optimistic
 * concurrency); health snapshots, events, receipts, cursors and audit rows are
 * append-only. RLS scopes every row to its tenant. No secret material is read or
 * written here — only references.
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  err, mapDatabaseError, ok,
  type ConnectorAuditEventRepository, type ConnectorEventRepository, type ConnectorHealthSnapshotRepository,
  type ConnectorInstallationRepository, type ConnectorOAuthGrantRepository, type ConnectorPollingCursorRepository,
  type ConnectorSecretReferenceRepository, type ConnectorWebhookReceiptRepository, type IntegrationRepositories,
  type RuntimeResult,
} from "@brightloop/domain";
import type {
  ConnectorAuditEvent, ConnectorEvent, ConnectorHealthSnapshot, ConnectorInstallation,
  ConnectorOAuthGrant, ConnectorPollingCursor, ConnectorSecretReference, ConnectorWebhookReceipt,
} from "@brightloop/schema";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import * as m from "./mappers.js";

const cast = (c: AuxionSupabaseClient): SupabaseClient => c as unknown as SupabaseClient;
const rec = (r: unknown) => r as Record<string, unknown>;

async function single<T>(p: PromiseLike<{ data: unknown; error: unknown }>, toDomain: (r: Record<string, unknown>) => T, ctx: string): Promise<RuntimeResult<T>> {
  const { data, error } = await p;
  if (error) return mapDatabaseError(error as never, ctx);
  return ok("created", toDomain(rec(data)));
}

export class SupabaseConnectorInstallationRepository implements ConnectorInstallationRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  create(r: ConnectorInstallation) { return single(this.db.from("connector_installation").insert(m.installationRow(r)).select("*").single(), m.toInstallation, "connectorInstallation.create"); }
  async getById(id: string): Promise<RuntimeResult<ConnectorInstallation | null>> { const { data, error } = await this.db.from("connector_installation").select("*").eq("id", id).maybeSingle(); if (error) return mapDatabaseError(error, "connectorInstallation.getById"); return ok("found", data ? m.toInstallation(rec(data)) : null); }
  async findByConnector(workspaceId: string, connectorId: string): Promise<RuntimeResult<ConnectorInstallation | null>> { const { data, error } = await this.db.from("connector_installation").select("*").eq("workspace_id", workspaceId).eq("connector_id", connectorId).maybeSingle(); if (error) return mapDatabaseError(error, "connectorInstallation.findByConnector"); return ok("found", data ? m.toInstallation(rec(data)) : null); }
  async listByWorkspace(w: string): Promise<RuntimeResult<ConnectorInstallation[]>> { const { data, error } = await this.db.from("connector_installation").select("*").eq("workspace_id", w).order("created_at", { ascending: false }); if (error) return mapDatabaseError(error, "connectorInstallation.listByWorkspace"); return ok("found", (data ?? []).map((x) => m.toInstallation(rec(x)))); }
  async save(next: ConnectorInstallation, expected: number): Promise<RuntimeResult<ConnectorInstallation>> { const { data, error } = await this.db.from("connector_installation").update(m.installationRow(next)).eq("id", next.id).eq("version", expected).select("*").maybeSingle(); if (error) return mapDatabaseError(error, "connectorInstallation.save"); if (data === null) return err("conflict", "connectorInstallation.save: version mismatch"); return ok("updated", m.toInstallation(rec(data))); }
}

export class SupabaseConnectorSecretReferenceRepository implements ConnectorSecretReferenceRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  create(r: ConnectorSecretReference) { return single(this.db.from("connector_secret_reference").insert(m.secretReferenceRow(r)).select("*").single(), m.toSecretReference, "connectorSecret.create"); }
  async getById(id: string): Promise<RuntimeResult<ConnectorSecretReference | null>> { const { data, error } = await this.db.from("connector_secret_reference").select("*").eq("id", id).maybeSingle(); if (error) return mapDatabaseError(error, "connectorSecret.getById"); return ok("found", data ? m.toSecretReference(rec(data)) : null); }
  async listByInstallation(id: string): Promise<RuntimeResult<ConnectorSecretReference[]>> { const { data, error } = await this.db.from("connector_secret_reference").select("*").eq("connector_installation_id", id); if (error) return mapDatabaseError(error, "connectorSecret.listByInstallation"); return ok("found", (data ?? []).map((x) => m.toSecretReference(rec(x)))); }
  async save(next: ConnectorSecretReference): Promise<RuntimeResult<ConnectorSecretReference>> { const { data, error } = await this.db.from("connector_secret_reference").update(m.secretReferenceRow(next)).eq("id", next.id).select("*").maybeSingle(); if (error) return mapDatabaseError(error, "connectorSecret.save"); if (data === null) return err("conflict", "connectorSecret.save: not found"); return ok("updated", m.toSecretReference(rec(data))); }
}

export class SupabaseConnectorHealthSnapshotRepository implements ConnectorHealthSnapshotRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  append(r: ConnectorHealthSnapshot) { return single(this.db.from("connector_health_snapshot").insert(m.healthSnapshotRow(r)).select("*").single(), m.toHealthSnapshot, "connectorHealth.append"); }
  async listByInstallation(id: string, limit: number): Promise<RuntimeResult<ConnectorHealthSnapshot[]>> { const { data, error } = await this.db.from("connector_health_snapshot").select("*").eq("connector_installation_id", id).order("created_at", { ascending: false }).limit(limit); if (error) return mapDatabaseError(error, "connectorHealth.listByInstallation"); return ok("found", (data ?? []).map((x) => m.toHealthSnapshot(rec(x)))); }
}

export class SupabaseConnectorEventRepository implements ConnectorEventRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  append(r: ConnectorEvent) { return single(this.db.from("connector_event").insert(m.eventRow(r)).select("*").single(), m.toEvent, "connectorEvent.append"); }
  async findByIdempotencyKey(key: string): Promise<RuntimeResult<ConnectorEvent | null>> { const { data, error } = await this.db.from("connector_event").select("*").eq("idempotency_key", key).maybeSingle(); if (error) return mapDatabaseError(error, "connectorEvent.findByIdempotencyKey"); return ok("found", data ? m.toEvent(rec(data)) : null); }
  async listByInstallation(id: string, limit: number): Promise<RuntimeResult<ConnectorEvent[]>> { const { data, error } = await this.db.from("connector_event").select("*").eq("connector_installation_id", id).order("created_at", { ascending: false }).limit(limit); if (error) return mapDatabaseError(error, "connectorEvent.listByInstallation"); return ok("found", (data ?? []).map((x) => m.toEvent(rec(x)))); }
}

export class SupabaseConnectorWebhookReceiptRepository implements ConnectorWebhookReceiptRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  append(r: ConnectorWebhookReceipt) { return single(this.db.from("connector_webhook_receipt").insert(m.webhookReceiptRow(r)).select("*").single(), m.toWebhookReceipt, "connectorWebhook.append"); }
  async findByIdempotencyKey(key: string): Promise<RuntimeResult<ConnectorWebhookReceipt | null>> { const { data, error } = await this.db.from("connector_webhook_receipt").select("*").eq("idempotency_key", key).maybeSingle(); if (error) return mapDatabaseError(error, "connectorWebhook.findByIdempotencyKey"); return ok("found", data ? m.toWebhookReceipt(rec(data)) : null); }
  async listByInstallation(id: string, limit: number): Promise<RuntimeResult<ConnectorWebhookReceipt[]>> { const { data, error } = await this.db.from("connector_webhook_receipt").select("*").eq("connector_installation_id", id).order("created_at", { ascending: false }).limit(limit); if (error) return mapDatabaseError(error, "connectorWebhook.listByInstallation"); return ok("found", (data ?? []).map((x) => m.toWebhookReceipt(rec(x)))); }
}

export class SupabaseConnectorPollingCursorRepository implements ConnectorPollingCursorRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  append(r: ConnectorPollingCursor) { return single(this.db.from("connector_polling_cursor").insert(m.pollingCursorRow(r)).select("*").single(), m.toPollingCursor, "connectorCursor.append"); }
  async findByIdempotencyKey(key: string): Promise<RuntimeResult<ConnectorPollingCursor | null>> { const { data, error } = await this.db.from("connector_polling_cursor").select("*").eq("idempotency_key", key).maybeSingle(); if (error) return mapDatabaseError(error, "connectorCursor.findByIdempotencyKey"); return ok("found", data ? m.toPollingCursor(rec(data)) : null); }
  async latest(id: string): Promise<RuntimeResult<ConnectorPollingCursor | null>> { const { data, error } = await this.db.from("connector_polling_cursor").select("*").eq("connector_installation_id", id).order("sequence", { ascending: false }).limit(1).maybeSingle(); if (error) return mapDatabaseError(error, "connectorCursor.latest"); return ok("found", data ? m.toPollingCursor(rec(data)) : null); }
}

export class SupabaseConnectorOAuthGrantRepository implements ConnectorOAuthGrantRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  create(r: ConnectorOAuthGrant) { return single(this.db.from("connector_oauth_grant").insert(m.oauthGrantRow(r)).select("*").single(), m.toOAuthGrant, "connectorOAuth.create"); }
  async getById(id: string): Promise<RuntimeResult<ConnectorOAuthGrant | null>> { const { data, error } = await this.db.from("connector_oauth_grant").select("*").eq("id", id).maybeSingle(); if (error) return mapDatabaseError(error, "connectorOAuth.getById"); return ok("found", data ? m.toOAuthGrant(rec(data)) : null); }
  async findByState(stateToken: string): Promise<RuntimeResult<ConnectorOAuthGrant | null>> { const { data, error } = await this.db.from("connector_oauth_grant").select("*").eq("state_token", stateToken).maybeSingle(); if (error) return mapDatabaseError(error, "connectorOAuth.findByState"); return ok("found", data ? m.toOAuthGrant(rec(data)) : null); }
  async save(next: ConnectorOAuthGrant, expected: number): Promise<RuntimeResult<ConnectorOAuthGrant>> { const { data, error } = await this.db.from("connector_oauth_grant").update(m.oauthGrantRow(next)).eq("id", next.id).eq("version", expected).select("*").maybeSingle(); if (error) return mapDatabaseError(error, "connectorOAuth.save"); if (data === null) return err("conflict", "connectorOAuth.save: version mismatch"); return ok("updated", m.toOAuthGrant(rec(data))); }
}

export class SupabaseConnectorAuditEventRepository implements ConnectorAuditEventRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  append(r: ConnectorAuditEvent) { return single(this.db.from("connector_audit_event").insert(m.auditEventRow(r)).select("*").single(), m.toAuditEvent, "connectorAudit.append"); }
  async listByInstallation(id: string, limit: number): Promise<RuntimeResult<ConnectorAuditEvent[]>> { const { data, error } = await this.db.from("connector_audit_event").select("*").eq("connector_installation_id", id).order("created_at", { ascending: false }).limit(limit); if (error) return mapDatabaseError(error, "connectorAudit.listByInstallation"); return ok("found", (data ?? []).map((x) => m.toAuditEvent(rec(x)))); }
}

/** Compose the eight adapters into the aggregate bundle the app layer wires. */
export function createIntegrationRepositories(c: AuxionSupabaseClient): IntegrationRepositories {
  return {
    installations: new SupabaseConnectorInstallationRepository(c),
    secrets: new SupabaseConnectorSecretReferenceRepository(c),
    health: new SupabaseConnectorHealthSnapshotRepository(c),
    events: new SupabaseConnectorEventRepository(c),
    webhooks: new SupabaseConnectorWebhookReceiptRepository(c),
    cursors: new SupabaseConnectorPollingCursorRepository(c),
    oauthGrants: new SupabaseConnectorOAuthGrantRepository(c),
    audit: new SupabaseConnectorAuditEventRepository(c),
  };
}
