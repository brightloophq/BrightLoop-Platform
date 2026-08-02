/* =============================================================================
 * Integration Platform — provider adapter + secret-store PORTS (F4.1). PURE.
 *
 * The domain depends ONLY on these interfaces, never on a provider SDK or an HTTP
 * client. Concrete adapters (a deterministic Fake connector for the framework +
 * tests, and each real integration later) live in the data layer and implement
 * these. Provider-specific types never leak upward: the inputs/outputs here are
 * provider-neutral, normalized shapes. No io in this file.
 *
 * This generalizes the F3 `RuntimeAdapter` seam from a single n8n runtime to an
 * open set of connectors, adding the OAuth / webhook / polling / event-translation
 * abstractions an integration platform needs.
 * ========================================================================== */

import type {
  ConnectorAuthMethod, ConnectorEventSource, ConnectorFailureCategory, ConnectorHealthLevel,
} from "@brightloop/schema";

/* ---- shared result envelope ------------------------------------------------ */

export interface ConnectorOk<T> { ok: true; value: T }
export interface ConnectorErr {
  ok: false;
  /** Normalized taxonomy — the adapter never leaks a raw provider error. */
  category: ConnectorFailureCategory;
  /** Short, safe provider code (never a response body/secret). */
  code: string | null;
  message: string;
}
export type ConnectorResult<T> = ConnectorOk<T> | ConnectorErr;

export const connectorOk = <T>(value: T): ConnectorOk<T> => ({ ok: true, value });
export const connectorErr = (category: ConnectorFailureCategory, message: string, code: string | null = null): ConnectorErr =>
  ({ ok: false, category, code, message });

/* ---- resolved connection context (secrets resolved at the boundary) -------- */

/**
 * Everything an adapter call needs, with the secret ALREADY resolved from the
 * store by the application layer. The `secret` is present only for the duration
 * of the call and never persisted, logged, or returned.
 */
export interface ConnectorConnectionInput {
  connectorId: string;
  authMethod: ConnectorAuthMethod;
  /** Non-secret configuration for the installation. */
  config: Record<string, unknown>;
  /** The resolved credential/token secret, or null for `none` auth. */
  secret: string | null;
}

/* ---- connection / capability / health -------------------------------------- */

export interface ConnectorConnectionValidationResult { reachable: boolean; authenticated: boolean; providerVersion: string | null; latencyMs: number }
export interface ConnectorCapabilityResult { operation: string; supported: boolean }
export interface ConnectorHealthResult { level: ConnectorHealthLevel; providerVersion: string | null; latencyMs: number; detail: Record<string, unknown> }

/* ---- OAuth ----------------------------------------------------------------- */

export interface BuildAuthorizationUrlInput {
  connectorId: string;
  /** Opaque CSRF state token minted by the domain and bound to the grant. */
  state: string;
  scopes: readonly string[];
  redirectUri: string;
  config: Record<string, unknown>;
}
export interface ExchangeCodeInput {
  connectorId: string;
  code: string;
  /** The state returned by the provider; the caller has already verified it. */
  state: string;
  redirectUri: string;
  config: Record<string, unknown>;
}
export interface RefreshTokenInput { connectorId: string; refreshToken: string; config: Record<string, unknown> }
/** The opaque token bundle an adapter returns; the application stores it by ref. */
export interface OAuthTokenBundle {
  accessToken: string;
  refreshToken: string | null;
  scopes: readonly string[];
  /** Absolute ISO expiry, or null if the provider does not expire tokens. */
  expiresAt: string | null;
  tokenType: string;
}

/* ---- webhook + polling ----------------------------------------------------- */

export interface VerifyWebhookInput {
  connectorId: string;
  /** The raw request body (bounded upstream) — untrusted DATA, never a command. */
  rawBody: string;
  /** Provider signature header value, if any. */
  signature: string | null;
  /** The resolved webhook-signing secret, or null. */
  signingSecret: string | null;
}
export interface VerifiedWebhook { valid: boolean; externalEventId: string }

export interface PollInput {
  connectorId: string;
  authMethod: ConnectorAuthMethod;
  config: Record<string, unknown>;
  secret: string | null;
  /** The last committed cursor, or null on first poll. */
  cursor: string | null;
  /** Hard cap on events returned this turn. */
  limit: number;
}

/** A translated, canonical, provider-neutral event ready for internal ingestion. */
export interface CanonicalConnectorEvent {
  /** Canonical internal type (e.g. "message.received"). */
  type: string;
  /** Provider's opaque event id (idempotency anchor). */
  externalId: string;
  occurredAt: string;
  /** Bounded, sanitized payload — never raw provider body or secret material. */
  payload: Record<string, unknown>;
  provenance: string;
}
export interface PollResult { events: CanonicalConnectorEvent[]; nextCursor: string | null }
export interface TranslateWebhookInput {
  connectorId: string;
  rawBody: string;
  source: ConnectorEventSource;
}

/* ---- the port -------------------------------------------------------------- */

/**
 * The contract every connector implements. Provider-neutral in/out. Optional
 * capabilities (OAuth, webhook, polling) are present only when the connector's
 * descriptor declares the corresponding auth method / trigger kind; the platform
 * checks the descriptor before invoking them.
 */
export interface ConnectorAdapter {
  readonly connectorId: string;

  /** Validate connectivity + auth (external read). */
  validateConnection(input: ConnectorConnectionInput): Promise<ConnectorResult<ConnectorConnectionValidationResult>>;
  /** Probe provider health. */
  healthCheck(input: ConnectorConnectionInput): Promise<ConnectorResult<ConnectorHealthResult>>;
  /** Discover which declared capabilities are actually available right now. */
  discoverCapabilities(input: ConnectorConnectionInput): Promise<ConnectorResult<ConnectorCapabilityResult[]>>;

  /* -- OAuth (oauth2 connectors only) -- */
  /** Build the provider authorization URL. Deterministic given its inputs. */
  buildAuthorizationUrl?(input: BuildAuthorizationUrlInput): ConnectorResult<string>;
  exchangeAuthorizationCode?(input: ExchangeCodeInput): Promise<ConnectorResult<OAuthTokenBundle>>;
  refreshAccessToken?(input: RefreshTokenInput): Promise<ConnectorResult<OAuthTokenBundle>>;

  /* -- webhook (trigger kind "webhook") -- */
  /** Verify a webhook signature. Deterministic; no io. */
  verifyWebhook?(input: VerifyWebhookInput): ConnectorResult<VerifiedWebhook>;
  /** Translate a verified raw webhook body into canonical events. Deterministic. */
  translateWebhook?(input: TranslateWebhookInput): ConnectorResult<CanonicalConnectorEvent[]>;

  /* -- polling (trigger kind "polling") -- */
  poll?(input: PollInput): Promise<ConnectorResult<PollResult>>;
}

/** A registry of adapters keyed by connector id, injected at the application layer. */
export type ConnectorAdapterRegistry = Partial<Record<string, ConnectorAdapter>>;

/* ---- secret store PORT ----------------------------------------------------- */

export interface ConnectorSecretMetadata { connectorId: string; purpose: string; version: string; rotatedAt: string | null; expiresAt: string | null }
export interface ConnectorSecretValidation { valid: boolean; reason: string | null }

/**
 * The abstraction over wherever real connector secrets live. The application
 * NEVER handles a raw secret except by passing an opaque `ref` to `getSecret` at
 * the adapter boundary; secret VALUES never enter DTOs, read models, logs, or the
 * database. Mirrors the F3 `RuntimeSecretStore`.
 */
export interface ConnectorSecretStore {
  putSecret(ref: string, value: string, metadata: ConnectorSecretMetadata): Promise<void>;
  getSecret(ref: string): Promise<string | null>;
  rotateSecret(ref: string, value: string): Promise<string>;
  revokeSecret(ref: string): Promise<void>;
  validateSecretReference(ref: string): Promise<ConnectorSecretValidation>;
}
