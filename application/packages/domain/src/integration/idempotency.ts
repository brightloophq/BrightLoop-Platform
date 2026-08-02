/* =============================================================================
 * Integration Platform — idempotency keys (F4.1). PURE.
 *
 * Every side-effectful ingestion derives a STABLE key so a repeated request
 * returns the existing result, never a duplicate event / receipt / install. Keys
 * are deterministic string joins — no clock, no randomness. Deduplication is
 * STRUCTURAL: a crash-and-retry recomputes the same key and the repository
 * replays. No dedupe table, no lock.
 * ========================================================================== */

const join = (...parts: readonly (string | number)[]): string => parts.map((p) => String(p)).join(":");

/** install: workspace + connector (one installation per connector per workspace). */
export const installKey = (workspaceId: string, connectorId: string): string =>
  join("install", workspaceId, connectorId);

/** webhook receipt: installation + provider externalEventId. */
export const connectorWebhookKey = (connectorInstallationId: string, externalEventId: string): string =>
  join("webhook", connectorInstallationId, externalEventId);

/** poll turn: installation + the cursor the turn started from (or "genesis"). */
export const pollKey = (connectorInstallationId: string, fromCursor: string | null): string =>
  join("poll", connectorInstallationId, fromCursor ?? "genesis");

/** canonical event: installation + source + provider externalId + canonical type. */
export const eventKey = (connectorInstallationId: string, source: string, externalId: string, type: string): string =>
  join("event", connectorInstallationId, source, externalId, type);

/** oauth grant: installation + state token. */
export const oauthKey = (connectorInstallationId: string, stateToken: string): string =>
  join("oauth", connectorInstallationId, stateToken);
