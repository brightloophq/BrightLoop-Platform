/* =============================================================================
 * Integration Platform — immutable entity builders (F4.1). PURE.
 *
 * Deterministic factories that construct fully-formed records from explicit
 * inputs (ids, clock, actor supplied by the caller). No hidden defaults for
 * identity/time; no io. Mirrors the F3 builders pattern.
 * ========================================================================== */

import type {
  ConnectorAuditEvent, ConnectorAuthMethod, ConnectorEvent, ConnectorEventSource, ConnectorHealthLevel,
  ConnectorHealthSnapshot, ConnectorInstallation, ConnectorOAuthGrant, ConnectorOperation,
  ConnectorPollingCursor, ConnectorSecretReference, ConnectorTriggerKind, ConnectorWebhookReceipt,
  SecretPurpose,
} from "@brightloop/schema";
import { sanitizeConnectorMetadata } from "./redaction.js";

export interface BuildInstallationInput {
  id: string; workspaceId: string; clientId: string | null; connectorId: string;
  displayName: string; authMethod: ConnectorAuthMethod; triggerKind: ConnectorTriggerKind;
  config: Record<string, unknown>; enabledCapabilities: readonly string[];
  secretReferenceId: string | null; createdByUserId: string; correlationId: string; now: string;
}
export function buildConnectorInstallation(i: BuildInstallationInput): ConnectorInstallation {
  return {
    id: i.id, workspaceId: i.workspaceId, clientId: i.clientId, connectorId: i.connectorId,
    displayName: i.displayName.slice(0, 200), status: "pending_configuration", authMethod: i.authMethod,
    triggerKind: i.triggerKind, config: sanitizeConnectorMetadata(i.config), enabledCapabilities: [...i.enabledCapabilities],
    secretReferenceId: i.secretReferenceId, healthLevel: "unknown", lastHealthCheckAt: null,
    webhookEndpointId: null, pollingCursor: null, createdByUserId: i.createdByUserId,
    correlationId: i.correlationId, version: 1, createdAt: i.now, updatedAt: i.now,
  };
}

export interface BuildSecretReferenceInput {
  id: string; workspaceId: string; clientId: string | null; connectorInstallationId: string;
  connectorId: string; purpose: SecretPurpose; secretRef: string; secretVersion?: string;
  metadata?: Record<string, unknown>; expiresAt?: string | null; createdByUserId: string; now: string;
}
export function buildConnectorSecretReference(i: BuildSecretReferenceInput): ConnectorSecretReference {
  return {
    id: i.id, workspaceId: i.workspaceId, clientId: i.clientId, connectorInstallationId: i.connectorInstallationId,
    connectorId: i.connectorId, purpose: i.purpose, secretRef: i.secretRef, secretVersion: i.secretVersion ?? "1",
    metadata: sanitizeConnectorMetadata(i.metadata ?? {}), validationState: "unverified", rotatedAt: null,
    expiresAt: i.expiresAt ?? null, createdByUserId: i.createdByUserId, createdAt: i.now, updatedAt: i.now,
  };
}

export function buildConnectorHealthSnapshot(
  id: string, connectorInstallationId: string, workspaceId: string, clientId: string | null,
  level: ConnectorHealthLevel, latencyMs: number, detail: Record<string, unknown>, now: string,
): ConnectorHealthSnapshot {
  return {
    id, connectorInstallationId, workspaceId, clientId, level, latencyMs: Math.max(0, Math.trunc(latencyMs)),
    detail: sanitizeConnectorMetadata(detail), checkedAt: now, createdAt: now,
  };
}

export interface BuildEventInput {
  id: string; connectorInstallationId: string; workspaceId: string; clientId: string | null;
  connectorId: string; type: string; externalId: string; source: ConnectorEventSource;
  occurredAt: string; idempotencyKey: string; payload: Record<string, unknown>; provenance: string; now: string;
}
export function buildConnectorEvent(i: BuildEventInput): ConnectorEvent {
  return {
    id: i.id, connectorInstallationId: i.connectorInstallationId, workspaceId: i.workspaceId, clientId: i.clientId,
    connectorId: i.connectorId, type: i.type, externalId: i.externalId, source: i.source, status: "translated",
    occurredAt: i.occurredAt, ingestedAt: i.now, idempotencyKey: i.idempotencyKey,
    payload: sanitizeConnectorMetadata(i.payload), provenance: i.provenance.slice(0, 500), createdAt: i.now,
  };
}

export interface BuildWebhookReceiptInput {
  id: string; connectorInstallationId: string; workspaceId: string; clientId: string | null;
  connectorId: string; externalEventId: string; idempotencyKey: string; signatureValid: boolean;
  status: ConnectorWebhookReceipt["status"]; eventCount: number; now: string; processedAt?: string | null;
}
export function buildConnectorWebhookReceipt(i: BuildWebhookReceiptInput): ConnectorWebhookReceipt {
  return {
    id: i.id, connectorInstallationId: i.connectorInstallationId, workspaceId: i.workspaceId, clientId: i.clientId,
    connectorId: i.connectorId, externalEventId: i.externalEventId, idempotencyKey: i.idempotencyKey,
    signatureValid: i.signatureValid, status: i.status, eventCount: Math.max(0, Math.trunc(i.eventCount)),
    receivedAt: i.now, processedAt: i.processedAt ?? null, createdAt: i.now,
  };
}

export interface BuildPollingCursorInput {
  id: string; connectorInstallationId: string; workspaceId: string; clientId: string | null;
  fromCursor: string | null; toCursor: string | null; eventCount: number; sequence: number;
  idempotencyKey: string; now: string;
}
export function buildPollingCursor(i: BuildPollingCursorInput): ConnectorPollingCursor {
  return {
    id: i.id, connectorInstallationId: i.connectorInstallationId, workspaceId: i.workspaceId, clientId: i.clientId,
    fromCursor: i.fromCursor, toCursor: i.toCursor, eventCount: Math.max(0, Math.trunc(i.eventCount)),
    sequence: Math.max(0, Math.trunc(i.sequence)), idempotencyKey: i.idempotencyKey, polledAt: i.now, createdAt: i.now,
  };
}

export interface BuildOAuthGrantInput {
  id: string; connectorInstallationId: string; workspaceId: string; clientId: string | null;
  connectorId: string; stateToken: string; scopes: readonly string[]; redirectUri: string;
  authorizationUrl: string; expiresAt: string | null; createdByUserId: string; now: string;
}
export function buildOAuthGrant(i: BuildOAuthGrantInput): ConnectorOAuthGrant {
  return {
    id: i.id, connectorInstallationId: i.connectorInstallationId, workspaceId: i.workspaceId, clientId: i.clientId,
    connectorId: i.connectorId, status: "pending", stateToken: i.stateToken, scopes: [...i.scopes],
    redirectUri: i.redirectUri, secretReferenceId: null, authorizationUrl: i.authorizationUrl,
    expiresAt: i.expiresAt, createdByUserId: i.createdByUserId, version: 1, createdAt: i.now, updatedAt: i.now,
  };
}

export interface BuildAuditEventInput {
  id: string; connectorInstallationId: string; workspaceId: string; clientId: string | null;
  operation: ConnectorOperation; fromStatus?: string | null; toStatus?: string | null;
  actorUserId: string | null; summary: string; correlationId: string; now: string;
}
export function buildAuditEvent(i: BuildAuditEventInput): ConnectorAuditEvent {
  return {
    id: i.id, connectorInstallationId: i.connectorInstallationId, workspaceId: i.workspaceId, clientId: i.clientId,
    operation: i.operation, fromStatus: i.fromStatus ?? null, toStatus: i.toStatus ?? null,
    actorUserId: i.actorUserId, summary: i.summary.slice(0, 500), correlationId: i.correlationId, createdAt: i.now,
  };
}
