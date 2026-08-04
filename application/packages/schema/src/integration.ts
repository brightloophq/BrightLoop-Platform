/* =============================================================================
 * Integration Platform (Phase F · Sprint F4.1) — schema contracts.
 *
 * The framework EVERY external service plugs into. Not Gmail, not Slack, not
 * Shopify — the connector platform those integrations will use. A connector is a
 * provider-neutral descriptor in the Connector Registry; an INSTALLATION is a
 * tenant-scoped instance of a connector, configured, authorized (by secret
 * REFERENCE only), health-checked, and driven by webhook or polling. External
 * provider events are translated into canonical internal events.
 *
 * AUXION REMAINS THE SYSTEM OF RECORD. The external provider is never
 * authoritative for identity, configuration, authorization, audit, or lifecycle.
 * Additive; a new `integration` bounded context. It stores NO raw secret — only
 * references + validation posture. Everything here is a data contract; all logic
 * is pure `@brightloop/domain`.
 * ========================================================================== */

import { z } from "zod";

/* ---- connector taxonomy ---------------------------------------------------- */

/** Marketplace grouping — provider-neutral, never a vendor name. */
export const connectorCategorySchema = z.enum([
  "communication", "crm", "commerce", "payments", "marketing",
  "productivity", "storage", "analytics", "custom",
]);
export type ConnectorCategory = z.infer<typeof connectorCategorySchema>;

/** How an installation authenticates with the provider. */
export const connectorAuthMethodSchema = z.enum(["none", "api_key", "basic", "oauth2"]);
export type ConnectorAuthMethod = z.infer<typeof connectorAuthMethodSchema>;

/** How the provider delivers events into Auxion. */
export const connectorTriggerKindSchema = z.enum(["webhook", "polling", "none"]);
export type ConnectorTriggerKind = z.infer<typeof connectorTriggerKindSchema>;

/** The side-effect class of a connector capability (mirrors the agent model). */
export const connectorSideEffectSchema = z.enum(["read", "write", "external"]);
export type ConnectorSideEffect = z.infer<typeof connectorSideEffectSchema>;

/** A config field's data type. `secret` fields are stored ONLY by reference. */
export const configFieldTypeSchema = z.enum(["string", "number", "boolean", "secret", "enum", "url"]);
export type ConfigFieldType = z.infer<typeof configFieldTypeSchema>;

/* ---- lifecycle + health ---------------------------------------------------- */

export const connectorInstallationStatusSchema = z.enum([
  "pending_configuration", "configuring", "validating", "connected",
  "degraded", "disabled", "error", "revoked",
]);
export type ConnectorInstallationStatus = z.infer<typeof connectorInstallationStatusSchema>;

export const connectorHealthLevelSchema = z.enum(["healthy", "degraded", "unavailable", "unauthorized", "unknown"]);
export type ConnectorHealthLevel = z.infer<typeof connectorHealthLevelSchema>;

/** A secret REFERENCE only ever records validation posture, never a secret. */
export const secretValidationStateSchema = z.enum(["unverified", "valid", "invalid", "expired", "revoked"]);
export type SecretValidationState = z.infer<typeof secretValidationStateSchema>;

/** What a secret reference protects. */
export const secretPurposeSchema = z.enum(["credential", "oauth_token", "webhook_signing"]);
export type SecretPurpose = z.infer<typeof secretPurposeSchema>;

/* ---- event + ingestion ----------------------------------------------------- */

export const connectorEventSourceSchema = z.enum(["webhook", "polling", "manual"]);
export type ConnectorEventSource = z.infer<typeof connectorEventSourceSchema>;

export const connectorEventStatusSchema = z.enum(["received", "translated", "rejected", "duplicate"]);
export type ConnectorEventStatus = z.infer<typeof connectorEventStatusSchema>;

export const connectorWebhookReceiptStatusSchema = z.enum(["received", "verified", "processed", "rejected", "duplicate"]);
export type ConnectorWebhookReceiptStatus = z.infer<typeof connectorWebhookReceiptStatusSchema>;

/** Normalized, provider-neutral failure taxonomy for every connector operation. */
export const connectorFailureCategorySchema = z.enum([
  "authentication", "authorization", "validation", "unsupported", "conflict",
  "timeout", "throttled", "rate_limited", "provider_unavailable", "network",
  "signature_invalid", "secret_unavailable", "config_invalid", "unknown",
]);
export type ConnectorFailureCategory = z.infer<typeof connectorFailureCategorySchema>;

/* ---- OAuth ----------------------------------------------------------------- */

export const oauthGrantStatusSchema = z.enum(["pending", "authorized", "exchanged", "failed", "expired"]);
export type OAuthGrantStatus = z.infer<typeof oauthGrantStatusSchema>;

/* ---- audit ----------------------------------------------------------------- */

/** A lifecycle operation recorded in the append-only connector audit log. */
export const connectorOperationSchema = z.enum([
  "install", "configure", "enable", "disable", "revoke", "validate",
  "health_check", "rotate_secret", "oauth_begin", "oauth_complete",
  "webhook_ingest", "poll",
]);
export type ConnectorOperation = z.infer<typeof connectorOperationSchema>;

/* =============================================================================
 * Connector Registry / Marketplace descriptors — pure catalogue metadata.
 * These are NOT persisted rows; they live in code (see @brightloop/domain
 * CONNECTOR_REGISTRY) and are validated by these schemas.
 * ========================================================================== */

/** One configurable field a connector declares. `secret:true` ⇒ stored by ref. */
export const configFieldDescriptorSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: configFieldTypeSchema,
  required: z.boolean().default(false),
  secret: z.boolean().default(false),
  helpText: z.string().nullable().default(null),
  /** Allowed values for `enum` fields. */
  options: z.array(z.string()).default([]),
});
export type ConfigFieldDescriptor = z.infer<typeof configFieldDescriptorSchema>;

/** A single operation a connector exposes (read/write/external). */
export const connectorCapabilityDescriptorSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().default(""),
  sideEffect: connectorSideEffectSchema,
  /** The provider-neutral operation name the adapter implements. */
  operation: z.string(),
});
export type ConnectorCapabilityDescriptor = z.infer<typeof connectorCapabilityDescriptorSchema>;

/** The canonical marketplace/registry entry for a connector TYPE. */
export const connectorDescriptorSchema = z.object({
  /** Opaque, stable connector id (never a live vendor unless implemented). */
  id: z.string(),
  name: z.string(),
  category: connectorCategorySchema,
  summary: z.string().default(""),
  /** Neutral vendor/label for display; not an implementation of a vendor. */
  vendor: z.string().default(""),
  authMethod: connectorAuthMethodSchema,
  triggerKinds: z.array(connectorTriggerKindSchema).default([]),
  capabilities: z.array(connectorCapabilityDescriptorSchema).default([]),
  configFields: z.array(configFieldDescriptorSchema).default([]),
  /** OAuth scopes requested at install (oauth2 connectors only). */
  scopes: z.array(z.string()).default([]),
  /** Registry version of this descriptor (bumped when the shape changes). */
  version: z.number().int().positive().default(1),
  /** Whether this connector can actually be installed (has a live adapter). */
  available: z.boolean().default(false),
  docsUrl: z.string().nullable().default(null),
});
export type ConnectorDescriptor = z.infer<typeof connectorDescriptorSchema>;

/* =============================================================================
 * Persisted entities.
 * ========================================================================== */

/** A tenant-scoped installation of a connector (versioned root). */
export const connectorInstallationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  connectorId: z.string(),
  displayName: z.string(),
  status: connectorInstallationStatusSchema.default("pending_configuration"),
  authMethod: connectorAuthMethodSchema,
  triggerKind: connectorTriggerKindSchema.default("none"),
  /** Non-secret configuration only. Secret fields live in the secret store. */
  config: z.record(z.string(), z.unknown()).default({}),
  /** The connector capabilities enabled for this installation. */
  enabledCapabilities: z.array(z.string()).default([]),
  /** Reference row id for the primary credential/token (never the secret). */
  secretReferenceId: z.string().nullable().default(null),
  healthLevel: connectorHealthLevelSchema.default("unknown"),
  lastHealthCheckAt: z.string().nullable().default(null),
  /** Opaque endpoint id a provider posts webhooks to (never a raw URL secret). */
  webhookEndpointId: z.string().nullable().default(null),
  /** The last successfully-committed polling cursor, if any. */
  pollingCursor: z.string().nullable().default(null),
  createdByUserId: z.string(),
  correlationId: z.string(),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConnectorInstallation = z.infer<typeof connectorInstallationSchema>;

/** A REFERENCE to a connector secret (never the secret). Internal-only mutation. */
export const connectorSecretReferenceSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  connectorInstallationId: z.string(),
  connectorId: z.string(),
  purpose: secretPurposeSchema,
  /** Opaque pointer into the ConnectorSecretStore — NEVER the secret. */
  secretRef: z.string(),
  secretVersion: z.string().default("1"),
  /** Non-sensitive metadata only (scopes, key hint length — never the value). */
  metadata: z.record(z.string(), z.unknown()).default({}),
  validationState: secretValidationStateSchema.default("unverified"),
  rotatedAt: z.string().nullable().default(null),
  expiresAt: z.string().nullable().default(null),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConnectorSecretReference = z.infer<typeof connectorSecretReferenceSchema>;

/** An immutable health probe result (append-only). */
export const connectorHealthSnapshotSchema = z.object({
  id: z.string(),
  connectorInstallationId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  level: connectorHealthLevelSchema,
  latencyMs: z.number().int().nonnegative().default(0),
  detail: z.record(z.string(), z.unknown()).default({}),
  checkedAt: z.string(),
  createdAt: z.string(),
});
export type ConnectorHealthSnapshot = z.infer<typeof connectorHealthSnapshotSchema>;

/** A canonical, translated internal event (append-only, idempotent by key). */
export const connectorEventSchema = z.object({
  id: z.string(),
  connectorInstallationId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  connectorId: z.string(),
  /** Canonical internal event type (provider-neutral, e.g. "message.received"). */
  type: z.string(),
  /** The provider's opaque event id (idempotency anchor). */
  externalId: z.string(),
  source: connectorEventSourceSchema,
  status: connectorEventStatusSchema.default("translated"),
  occurredAt: z.string(),
  ingestedAt: z.string(),
  idempotencyKey: z.string(),
  /** Bounded, sanitized translated payload (never raw provider body/secrets). */
  payload: z.record(z.string(), z.unknown()).default({}),
  provenance: z.string().default(""),
  createdAt: z.string(),
});
export type ConnectorEvent = z.infer<typeof connectorEventSchema>;

/** An idempotent webhook ingestion receipt (append-only). */
export const connectorWebhookReceiptSchema = z.object({
  id: z.string(),
  connectorInstallationId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  connectorId: z.string(),
  externalEventId: z.string(),
  idempotencyKey: z.string(),
  signatureValid: z.boolean().default(false),
  status: connectorWebhookReceiptStatusSchema.default("received"),
  eventCount: z.number().int().nonnegative().default(0),
  receivedAt: z.string(),
  processedAt: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type ConnectorWebhookReceipt = z.infer<typeof connectorWebhookReceiptSchema>;

/** An append-only record of one polling turn (cursor advance + count). */
export const connectorPollingCursorSchema = z.object({
  id: z.string(),
  connectorInstallationId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  /** The cursor this turn STARTED from (null on first poll). */
  fromCursor: z.string().nullable().default(null),
  /** The cursor this turn COMMITTED (advances monotonically). */
  toCursor: z.string().nullable().default(null),
  eventCount: z.number().int().nonnegative().default(0),
  sequence: z.number().int().nonnegative().default(0),
  idempotencyKey: z.string(),
  polledAt: z.string(),
  createdAt: z.string(),
});
export type ConnectorPollingCursor = z.infer<typeof connectorPollingCursorSchema>;

/** An OAuth authorization grant (mutable root; internal-only, never a token). */
export const connectorOAuthGrantSchema = z.object({
  id: z.string(),
  connectorInstallationId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  connectorId: z.string(),
  status: oauthGrantStatusSchema.default("pending"),
  /** Opaque CSRF state token bound to this grant. */
  stateToken: z.string(),
  scopes: z.array(z.string()).default([]),
  redirectUri: z.string(),
  /** The reference row for the exchanged token bundle (never the token). */
  secretReferenceId: z.string().nullable().default(null),
  /** The provider authorization URL the user is redirected to. */
  authorizationUrl: z.string().default(""),
  expiresAt: z.string().nullable().default(null),
  createdByUserId: z.string(),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConnectorOAuthGrant = z.infer<typeof connectorOAuthGrantSchema>;

/** An append-only lifecycle audit event for an installation. */
export const connectorAuditEventSchema = z.object({
  id: z.string(),
  connectorInstallationId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  operation: connectorOperationSchema,
  fromStatus: z.string().nullable().default(null),
  toStatus: z.string().nullable().default(null),
  actorUserId: z.string().nullable().default(null),
  summary: z.string().default(""),
  correlationId: z.string(),
  createdAt: z.string(),
});
export type ConnectorAuditEvent = z.infer<typeof connectorAuditEventSchema>;

/** Schema version stamped onto integration records + events. */
export const INTEGRATION_SCHEMA_VERSION = 1 as const;
