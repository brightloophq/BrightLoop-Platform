/* =============================================================================
 * Integration Platform — REPOSITORY PORTS (F4.1).
 *
 * Installation, secret reference and OAuth grant are versioned or mutable roots
 * (optimistic concurrency / reference rows); health snapshots, events, webhook
 * receipts, polling cursors and audit events are append-only. Idempotency lookups
 * back the "return the existing result" guarantee for replay-safe ingestion. RLS
 * is the tenant boundary. Every method returns a `RuntimeResult` — no raw DB error
 * crosses the port.
 * ========================================================================== */

import type {
  ConnectorAuditEvent, ConnectorEvent, ConnectorHealthSnapshot, ConnectorInstallation,
  ConnectorOAuthGrant, ConnectorPollingCursor, ConnectorSecretReference, ConnectorWebhookReceipt,
} from "@brightloop/schema";
import type { RuntimeResult } from "../runtime/results.js";

export interface ConnectorInstallationRepository {
  create(row: ConnectorInstallation): Promise<RuntimeResult<ConnectorInstallation>>;
  getById(id: string): Promise<RuntimeResult<ConnectorInstallation | null>>;
  findByConnector(workspaceId: string, connectorId: string): Promise<RuntimeResult<ConnectorInstallation | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<ConnectorInstallation[]>>;
  save(next: ConnectorInstallation, expectedVersion: number): Promise<RuntimeResult<ConnectorInstallation>>;
}

export interface ConnectorSecretReferenceRepository {
  create(row: ConnectorSecretReference): Promise<RuntimeResult<ConnectorSecretReference>>;
  getById(id: string): Promise<RuntimeResult<ConnectorSecretReference | null>>;
  listByInstallation(connectorInstallationId: string): Promise<RuntimeResult<ConnectorSecretReference[]>>;
  save(next: ConnectorSecretReference): Promise<RuntimeResult<ConnectorSecretReference>>;
}

export interface ConnectorHealthSnapshotRepository {
  append(row: ConnectorHealthSnapshot): Promise<RuntimeResult<ConnectorHealthSnapshot>>;
  listByInstallation(connectorInstallationId: string, limit: number): Promise<RuntimeResult<ConnectorHealthSnapshot[]>>;
}

export interface ConnectorEventRepository {
  append(row: ConnectorEvent): Promise<RuntimeResult<ConnectorEvent>>;
  findByIdempotencyKey(key: string): Promise<RuntimeResult<ConnectorEvent | null>>;
  listByInstallation(connectorInstallationId: string, limit: number): Promise<RuntimeResult<ConnectorEvent[]>>;
}

export interface ConnectorWebhookReceiptRepository {
  append(row: ConnectorWebhookReceipt): Promise<RuntimeResult<ConnectorWebhookReceipt>>;
  findByIdempotencyKey(key: string): Promise<RuntimeResult<ConnectorWebhookReceipt | null>>;
  listByInstallation(connectorInstallationId: string, limit: number): Promise<RuntimeResult<ConnectorWebhookReceipt[]>>;
}

export interface ConnectorPollingCursorRepository {
  append(row: ConnectorPollingCursor): Promise<RuntimeResult<ConnectorPollingCursor>>;
  findByIdempotencyKey(key: string): Promise<RuntimeResult<ConnectorPollingCursor | null>>;
  latest(connectorInstallationId: string): Promise<RuntimeResult<ConnectorPollingCursor | null>>;
}

export interface ConnectorOAuthGrantRepository {
  create(row: ConnectorOAuthGrant): Promise<RuntimeResult<ConnectorOAuthGrant>>;
  getById(id: string): Promise<RuntimeResult<ConnectorOAuthGrant | null>>;
  findByState(stateToken: string): Promise<RuntimeResult<ConnectorOAuthGrant | null>>;
  save(next: ConnectorOAuthGrant, expectedVersion: number): Promise<RuntimeResult<ConnectorOAuthGrant>>;
}

export interface ConnectorAuditEventRepository {
  append(row: ConnectorAuditEvent): Promise<RuntimeResult<ConnectorAuditEvent>>;
  listByInstallation(connectorInstallationId: string, limit: number): Promise<RuntimeResult<ConnectorAuditEvent[]>>;
}

/** The aggregate bundle the application layer is wired with. */
export interface IntegrationRepositories {
  installations: ConnectorInstallationRepository;
  secrets: ConnectorSecretReferenceRepository;
  health: ConnectorHealthSnapshotRepository;
  events: ConnectorEventRepository;
  webhooks: ConnectorWebhookReceiptRepository;
  cursors: ConnectorPollingCursorRepository;
  oauthGrants: ConnectorOAuthGrantRepository;
  audit: ConnectorAuditEventRepository;
}
