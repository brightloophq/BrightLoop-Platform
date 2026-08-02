/* =============================================================================
 * Integration Platform — DTO boundary (F4.1).
 *
 * The ONLY shapes that cross outward to the web app. DTOs carry safe, presentable
 * fields and NOTHING sensitive: never a secretRef, never an idempotency key, never
 * an OAuth token, never raw config secrets (secrets are separated before the
 * installation is ever built). `hasCredential` is a boolean derived from the
 * presence of a secret reference — the reference id itself never leaves.
 * ========================================================================== */

import type {
  ConfigFieldDescriptor, ConnectorAuditEvent, ConnectorCapabilityDescriptor, ConnectorDescriptor,
  ConnectorEvent, ConnectorHealthSnapshot, ConnectorInstallation, ConnectorOAuthGrant,
} from "@brightloop/schema";

/* ---- marketplace descriptor ------------------------------------------------ */

export interface ConnectorCapabilityDTO { key: string; label: string; description: string; sideEffect: string; operation: string }
export interface ConfigFieldDTO { key: string; label: string; type: string; required: boolean; secret: boolean; helpText: string | null; options: string[] }
export interface ConnectorDescriptorDTO {
  id: string; name: string; category: string; summary: string; vendor: string;
  authMethod: string; triggerKinds: string[]; capabilities: ConnectorCapabilityDTO[];
  configFields: ConfigFieldDTO[]; scopes: string[]; version: number; available: boolean; docsUrl: string | null;
}

const toCapabilityDTO = (c: ConnectorCapabilityDescriptor): ConnectorCapabilityDTO =>
  ({ key: c.key, label: c.label, description: c.description, sideEffect: c.sideEffect, operation: c.operation });
const toConfigFieldDTO = (f: ConfigFieldDescriptor): ConfigFieldDTO =>
  ({ key: f.key, label: f.label, type: f.type, required: f.required, secret: f.secret, helpText: f.helpText, options: f.options });

export function toDescriptorDTO(d: ConnectorDescriptor): ConnectorDescriptorDTO {
  return {
    id: d.id, name: d.name, category: d.category, summary: d.summary, vendor: d.vendor,
    authMethod: d.authMethod, triggerKinds: [...d.triggerKinds], capabilities: d.capabilities.map(toCapabilityDTO),
    configFields: d.configFields.map(toConfigFieldDTO), scopes: [...d.scopes], version: d.version,
    available: d.available, docsUrl: d.docsUrl,
  };
}

/* ---- installation ---------------------------------------------------------- */

export interface InstallationDTO {
  id: string; connectorId: string; displayName: string; status: string; authMethod: string;
  triggerKind: string; healthLevel: string; enabledCapabilities: string[];
  /** Non-secret configuration only (secrets were separated at install/configure). */
  config: Record<string, unknown>;
  hasCredential: boolean; lastHealthCheckAt: string | null; createdAt: string; updatedAt: string;
}
export function toInstallationDTO(i: ConnectorInstallation): InstallationDTO {
  return {
    id: i.id, connectorId: i.connectorId, displayName: i.displayName, status: i.status, authMethod: i.authMethod,
    triggerKind: i.triggerKind, healthLevel: i.healthLevel, enabledCapabilities: [...i.enabledCapabilities],
    config: i.config, hasCredential: i.secretReferenceId !== null, lastHealthCheckAt: i.lastHealthCheckAt,
    createdAt: i.createdAt, updatedAt: i.updatedAt,
  };
}

/* ---- health ---------------------------------------------------------------- */

export interface ConnectorHealthDTO { level: string; latencyMs: number; detail: Record<string, unknown>; checkedAt: string }
export function toConnectorHealthDTO(h: ConnectorHealthSnapshot): ConnectorHealthDTO {
  return { level: h.level, latencyMs: h.latencyMs, detail: h.detail, checkedAt: h.checkedAt };
}

/* ---- event ----------------------------------------------------------------- */

export interface ConnectorEventDTO { id: string; type: string; externalId: string; source: string; status: string; occurredAt: string; ingestedAt: string; payload: Record<string, unknown> }
export function toConnectorEventDTO(e: ConnectorEvent): ConnectorEventDTO {
  return { id: e.id, type: e.type, externalId: e.externalId, source: e.source, status: e.status, occurredAt: e.occurredAt, ingestedAt: e.ingestedAt, payload: e.payload };
}

/* ---- audit ----------------------------------------------------------------- */

export interface ConnectorAuditEventDTO { id: string; operation: string; fromStatus: string | null; toStatus: string | null; summary: string; createdAt: string }
export function toConnectorAuditEventDTO(a: ConnectorAuditEvent): ConnectorAuditEventDTO {
  return { id: a.id, operation: a.operation, fromStatus: a.fromStatus, toStatus: a.toStatus, summary: a.summary, createdAt: a.createdAt };
}

/* ---- oauth (begin) --------------------------------------------------------- */

export interface OAuthBeginDTO { grantId: string; authorizationUrl: string; state: string; status: string; scopes: string[] }
export function toOAuthBeginDTO(g: ConnectorOAuthGrant): OAuthBeginDTO {
  return { grantId: g.id, authorizationUrl: g.authorizationUrl, state: g.stateToken, status: g.status, scopes: [...g.scopes] };
}

/* ---- ingestion summaries --------------------------------------------------- */

export interface WebhookIngestDTO { receiptId: string; status: string; signatureValid: boolean; eventCount: number }
export interface PollDTO { cursor: string | null; eventCount: number; sequence: number }
