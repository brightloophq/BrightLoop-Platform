/* =============================================================================
 * Integration Platform — row ↔ domain mappers (F4.1).
 *
 * The type-safe boundary. Jsonb fields (config, metadata, payload, scopes)
 * collapse defensively. NO secret material is ever mapped — secret/oauth rows
 * carry only a reference + validation posture.
 * ========================================================================== */

import type {
  ConnectorAuditEvent, ConnectorEvent, ConnectorHealthSnapshot, ConnectorInstallation,
  ConnectorOAuthGrant, ConnectorPollingCursor, ConnectorSecretReference, ConnectorWebhookReceipt,
} from "@brightloop/schema";

const int = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const nstr = (v: unknown): string | null => (v as string | null) ?? null;
const bool = (v: unknown, d = false): boolean => (typeof v === "boolean" ? v : d);
const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/* ---- installation ---------------------------------------------------------- */
export function installationRow(i: ConnectorInstallation): Record<string, unknown> {
  return { id: i.id, workspace_id: i.workspaceId, client_id: i.clientId, connector_id: i.connectorId, display_name: i.displayName, status: i.status, auth_method: i.authMethod, trigger_kind: i.triggerKind, config: i.config, enabled_capabilities: i.enabledCapabilities, secret_reference_id: i.secretReferenceId, health_level: i.healthLevel, last_health_check_at: i.lastHealthCheckAt, webhook_endpoint_id: i.webhookEndpointId, polling_cursor: i.pollingCursor, created_by_user_id: i.createdByUserId, correlation_id: i.correlationId, idempotency_key: installKeyOf(i), version: i.version, created_at: i.createdAt, updated_at: i.updatedAt };
}
/** The stable idempotency key for an installation row (workspace + connector). */
const installKeyOf = (i: ConnectorInstallation): string => `install:${i.workspaceId}:${i.connectorId}`;
export function toInstallation(r: Record<string, unknown>): ConnectorInstallation {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), connectorId: String(r["connector_id"]), displayName: String(r["display_name"]), status: r["status"] as ConnectorInstallation["status"], authMethod: r["auth_method"] as ConnectorInstallation["authMethod"], triggerKind: r["trigger_kind"] as ConnectorInstallation["triggerKind"], config: obj(r["config"]), enabledCapabilities: strArr(r["enabled_capabilities"]), secretReferenceId: nstr(r["secret_reference_id"]), healthLevel: r["health_level"] as ConnectorInstallation["healthLevel"], lastHealthCheckAt: nstr(r["last_health_check_at"]), webhookEndpointId: nstr(r["webhook_endpoint_id"]), pollingCursor: nstr(r["polling_cursor"]), createdByUserId: String(r["created_by_user_id"]), correlationId: String(r["correlation_id"] ?? ""), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

/* ---- secret reference ------------------------------------------------------ */
export function secretReferenceRow(s: ConnectorSecretReference): Record<string, unknown> {
  return { id: s.id, workspace_id: s.workspaceId, client_id: s.clientId, connector_installation_id: s.connectorInstallationId, connector_id: s.connectorId, purpose: s.purpose, secret_ref: s.secretRef, secret_version: s.secretVersion, metadata: s.metadata, validation_state: s.validationState, rotated_at: s.rotatedAt, expires_at: s.expiresAt, created_by_user_id: s.createdByUserId, created_at: s.createdAt, updated_at: s.updatedAt };
}
export function toSecretReference(r: Record<string, unknown>): ConnectorSecretReference {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), connectorInstallationId: String(r["connector_installation_id"]), connectorId: String(r["connector_id"]), purpose: r["purpose"] as ConnectorSecretReference["purpose"], secretRef: String(r["secret_ref"]), secretVersion: String(r["secret_version"] ?? "1"), metadata: obj(r["metadata"]), validationState: r["validation_state"] as ConnectorSecretReference["validationState"], rotatedAt: nstr(r["rotated_at"]), expiresAt: nstr(r["expires_at"]), createdByUserId: String(r["created_by_user_id"]), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

/* ---- health snapshot ------------------------------------------------------- */
export function healthSnapshotRow(h: ConnectorHealthSnapshot): Record<string, unknown> {
  return { id: h.id, connector_installation_id: h.connectorInstallationId, workspace_id: h.workspaceId, client_id: h.clientId, level: h.level, latency_ms: h.latencyMs, detail: h.detail, checked_at: h.checkedAt, created_at: h.createdAt };
}
export function toHealthSnapshot(r: Record<string, unknown>): ConnectorHealthSnapshot {
  return { id: String(r["id"]), connectorInstallationId: String(r["connector_installation_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), level: r["level"] as ConnectorHealthSnapshot["level"], latencyMs: int(r["latency_ms"]), detail: obj(r["detail"]), checkedAt: String(r["checked_at"]), createdAt: String(r["created_at"]) };
}

/* ---- event ----------------------------------------------------------------- */
export function eventRow(e: ConnectorEvent): Record<string, unknown> {
  return { id: e.id, connector_installation_id: e.connectorInstallationId, workspace_id: e.workspaceId, client_id: e.clientId, connector_id: e.connectorId, type: e.type, external_id: e.externalId, source: e.source, status: e.status, occurred_at: e.occurredAt, ingested_at: e.ingestedAt, idempotency_key: e.idempotencyKey, payload: e.payload, provenance: e.provenance, created_at: e.createdAt };
}
export function toEvent(r: Record<string, unknown>): ConnectorEvent {
  return { id: String(r["id"]), connectorInstallationId: String(r["connector_installation_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), connectorId: String(r["connector_id"]), type: String(r["type"]), externalId: String(r["external_id"]), source: r["source"] as ConnectorEvent["source"], status: r["status"] as ConnectorEvent["status"], occurredAt: String(r["occurred_at"]), ingestedAt: String(r["ingested_at"]), idempotencyKey: String(r["idempotency_key"]), payload: obj(r["payload"]), provenance: String(r["provenance"] ?? ""), createdAt: String(r["created_at"]) };
}

/* ---- webhook receipt ------------------------------------------------------- */
export function webhookReceiptRow(w: ConnectorWebhookReceipt): Record<string, unknown> {
  return { id: w.id, connector_installation_id: w.connectorInstallationId, workspace_id: w.workspaceId, client_id: w.clientId, connector_id: w.connectorId, external_event_id: w.externalEventId, idempotency_key: w.idempotencyKey, signature_valid: w.signatureValid, status: w.status, event_count: w.eventCount, received_at: w.receivedAt, processed_at: w.processedAt, created_at: w.createdAt };
}
export function toWebhookReceipt(r: Record<string, unknown>): ConnectorWebhookReceipt {
  return { id: String(r["id"]), connectorInstallationId: String(r["connector_installation_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), connectorId: String(r["connector_id"]), externalEventId: String(r["external_event_id"]), idempotencyKey: String(r["idempotency_key"]), signatureValid: bool(r["signature_valid"]), status: r["status"] as ConnectorWebhookReceipt["status"], eventCount: int(r["event_count"]), receivedAt: String(r["received_at"]), processedAt: nstr(r["processed_at"]), createdAt: String(r["created_at"]) };
}

/* ---- polling cursor -------------------------------------------------------- */
export function pollingCursorRow(c: ConnectorPollingCursor): Record<string, unknown> {
  return { id: c.id, connector_installation_id: c.connectorInstallationId, workspace_id: c.workspaceId, client_id: c.clientId, from_cursor: c.fromCursor, to_cursor: c.toCursor, event_count: c.eventCount, sequence: c.sequence, idempotency_key: c.idempotencyKey, polled_at: c.polledAt, created_at: c.createdAt };
}
export function toPollingCursor(r: Record<string, unknown>): ConnectorPollingCursor {
  return { id: String(r["id"]), connectorInstallationId: String(r["connector_installation_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), fromCursor: nstr(r["from_cursor"]), toCursor: nstr(r["to_cursor"]), eventCount: int(r["event_count"]), sequence: int(r["sequence"]), idempotencyKey: String(r["idempotency_key"]), polledAt: String(r["polled_at"]), createdAt: String(r["created_at"]) };
}

/* ---- oauth grant ----------------------------------------------------------- */
export function oauthGrantRow(g: ConnectorOAuthGrant): Record<string, unknown> {
  return { id: g.id, connector_installation_id: g.connectorInstallationId, workspace_id: g.workspaceId, client_id: g.clientId, connector_id: g.connectorId, status: g.status, state_token: g.stateToken, scopes: g.scopes, redirect_uri: g.redirectUri, secret_reference_id: g.secretReferenceId, authorization_url: g.authorizationUrl, expires_at: g.expiresAt, created_by_user_id: g.createdByUserId, version: g.version, created_at: g.createdAt, updated_at: g.updatedAt };
}
export function toOAuthGrant(r: Record<string, unknown>): ConnectorOAuthGrant {
  return { id: String(r["id"]), connectorInstallationId: String(r["connector_installation_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), connectorId: String(r["connector_id"]), status: r["status"] as ConnectorOAuthGrant["status"], stateToken: String(r["state_token"]), scopes: strArr(r["scopes"]), redirectUri: String(r["redirect_uri"]), secretReferenceId: nstr(r["secret_reference_id"]), authorizationUrl: String(r["authorization_url"] ?? ""), expiresAt: nstr(r["expires_at"]), createdByUserId: String(r["created_by_user_id"]), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

/* ---- audit event ----------------------------------------------------------- */
export function auditEventRow(a: ConnectorAuditEvent): Record<string, unknown> {
  return { id: a.id, connector_installation_id: a.connectorInstallationId, workspace_id: a.workspaceId, client_id: a.clientId, operation: a.operation, from_status: a.fromStatus, to_status: a.toStatus, actor_user_id: a.actorUserId, summary: a.summary, correlation_id: a.correlationId, created_at: a.createdAt };
}
export function toAuditEvent(r: Record<string, unknown>): ConnectorAuditEvent {
  return { id: String(r["id"]), connectorInstallationId: String(r["connector_installation_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), operation: r["operation"] as ConnectorAuditEvent["operation"], fromStatus: nstr(r["from_status"]), toStatus: nstr(r["to_status"]), actorUserId: nstr(r["actor_user_id"]), summary: String(r["summary"] ?? ""), correlationId: String(r["correlation_id"] ?? ""), createdAt: String(r["created_at"]) };
}
