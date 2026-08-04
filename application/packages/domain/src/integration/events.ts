/* =============================================================================
 * Integration Platform — domain event names (F4.1). PURE.
 *
 * The `integration.*` domain-event taxonomy emitted through the shared EventSink
 * for cross-cutting observers. Follows the `domain.object.action` convention; no
 * PII, no secrets in names or payloads. The persisted audit trail lives in the
 * append-only `connector_audit_event` table (separate mechanism).
 * ========================================================================== */

export const INTEGRATION_EVENTS = {
  installed: "integration.connector.installed",
  configured: "integration.connector.configured",
  enabled: "integration.connector.enabled",
  disabled: "integration.connector.disabled",
  revoked: "integration.connector.revoked",
  validated: "integration.connector.validated",
  healthChecked: "integration.connector.health_checked",
  secretRotated: "integration.connector.secret_rotated",
  oauthBegan: "integration.oauth.began",
  oauthCompleted: "integration.oauth.completed",
  webhookIngested: "integration.webhook.ingested",
  polled: "integration.connector.polled",
  eventTranslated: "integration.event.translated",
} as const;

export type IntegrationEventName = (typeof INTEGRATION_EVENTS)[keyof typeof INTEGRATION_EVENTS];
