/* =============================================================================
 * Google connectors — ConnectorAdapter assembly (F4.2). SERVER-ONLY.
 *
 * Builds a framework `ConnectorAdapter` for each Google service by composing the
 * OAuth flow, a cheap probe (validate/health), capability discovery from the
 * registry descriptor, per-service polling + event translation, and an `execute`
 * dispatcher over the service's operation map. Provider-neutral out; no Google
 * type or secret leaks past this boundary. Disabled-safe: with no client creds the
 * adapters still register but OAuth fails clearly and no token call is attempted.
 * ========================================================================== */

import {
  connectorErr, connectorOk, findConnector,
  type BuildAuthorizationUrlInput, type ConnectorAdapter, type ConnectorAdapterRegistry,
  type ConnectorConnectionInput, type ConnectorConnectionValidationResult, type ConnectorHealthResult,
  type ConnectorResult, type ExchangeCodeInput, type ExecuteOperationInput,
  type OperationOutput, type PollInput, type PollResult, type RefreshTokenInput,
} from "@brightloop/domain";
import { callGoogle, type GoogleAdapterConfig } from "./client.js";
import { buildGoogleAuthorizationUrl, exchangeGoogleCode, refreshGoogleToken } from "./oauth.js";
import { GMAIL_OPS, gmailPoll } from "./gmail.js";
import { CALENDAR_OPS, calendarPoll } from "./calendar.js";
import { DRIVE_OPS, drivePoll } from "./drive.js";
import { CONTACTS_OPS } from "./contacts.js";
import type { OpInput } from "./helpers.js";

type OpHandler = (cfg: GoogleAdapterConfig, token: string | null, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>;
type PollFn = (cfg: GoogleAdapterConfig, token: string | null, conn: OpInput, cursor: string | null, limit: number) => Promise<ConnectorResult<PollResult>>;

interface GoogleService {
  connectorId: string;
  /** A cheap authenticated GET that proves connectivity + auth. */
  probe: string;
  ops: Record<string, OpHandler>;
  poll?: PollFn;
}

const SERVICES: GoogleService[] = [
  { connectorId: "google-gmail", probe: "https://gmail.googleapis.com/gmail/v1/users/me/profile", ops: GMAIL_OPS, poll: gmailPoll },
  { connectorId: "google-calendar", probe: "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1", ops: CALENDAR_OPS, poll: calendarPoll },
  { connectorId: "google-drive", probe: "https://www.googleapis.com/drive/v3/about?fields=user", ops: DRIVE_OPS, poll: drivePoll },
  { connectorId: "google-contacts", probe: "https://people.googleapis.com/v1/people/me/connections?personFields=names&pageSize=1", ops: CONTACTS_OPS },
];

function createGoogleConnectorAdapter(cfg: GoogleAdapterConfig, service: GoogleService): ConnectorAdapter {
  const declaredOps = new Set((findConnector(service.connectorId)?.capabilities ?? []).map((c) => c.operation));

  return {
    connectorId: service.connectorId,

    async validateConnection(input: ConnectorConnectionInput): Promise<ConnectorResult<ConnectorConnectionValidationResult>> {
      const res = await callGoogle(cfg, input.secret, { method: "GET", url: service.probe });
      if (!res.ok) return connectorErr(res.category, res.message, res.code);
      return connectorOk({ reachable: true, authenticated: true, providerVersion: "v1", latencyMs: 0 });
    },

    async healthCheck(input: ConnectorConnectionInput): Promise<ConnectorResult<ConnectorHealthResult>> {
      const res = await callGoogle(cfg, input.secret, { method: "GET", url: service.probe });
      // Derive the precise reason from the failure category (covers all seven states).
      const reason = res.ok ? "connected"
        : res.category === "authentication" ? "expired"
          : res.category === "authorization" ? "permission_missing"
            : res.category === "throttled" || res.category === "rate_limited" ? "rate_limited"
              : res.category === "config_invalid" ? "configuration_error" : "disconnected";
      const level = res.ok ? "healthy" as const
        : reason === "expired" || reason === "permission_missing" ? "unauthorized" as const
          : reason === "rate_limited" || reason === "configuration_error" ? "degraded" as const : "unavailable" as const;
      return connectorOk({ level, providerVersion: "v1", latencyMs: 0, detail: { reason } });
    },

    async discoverCapabilities() {
      return connectorOk(Array.from(declaredOps).map((operation) => ({ operation, supported: true })));
    },

    buildAuthorizationUrl(input: BuildAuthorizationUrlInput) {
      return buildGoogleAuthorizationUrl(cfg, input);
    },
    exchangeAuthorizationCode(input: ExchangeCodeInput) {
      return exchangeGoogleCode(cfg, input);
    },
    refreshAccessToken(input: RefreshTokenInput) {
      return refreshGoogleToken(cfg, input);
    },

    ...(service.poll
      ? {
          async poll(input: PollInput): Promise<ConnectorResult<PollResult>> {
            return service.poll!(cfg, input.secret, input.config as OpInput, input.cursor, input.limit);
          },
        }
      : {}),

    async execute(input: ExecuteOperationInput): Promise<ConnectorResult<OperationOutput>> {
      const handler = service.ops[input.operation];
      if (handler === undefined) return connectorErr("unsupported", `operation ${input.operation} is not supported`, "unsupported_operation");
      return handler(cfg, input.secret, input.input as OpInput, input.config as OpInput);
    },
  };
}

/** Build the four Google connector adapters keyed by connector id. */
export function createGoogleConnectorAdapters(cfg: GoogleAdapterConfig): ConnectorAdapterRegistry {
  const registry: ConnectorAdapterRegistry = {};
  for (const service of SERVICES) registry[service.connectorId] = createGoogleConnectorAdapter(cfg, service);
  return registry;
}

/**
 * Load the app-level Google OAuth config from the environment. Client id/secret are
 * NEVER persisted; they are provisioned out-of-band. Returns a config even when
 * unset (OAuth then fails clearly) so the connectors still appear installable.
 */
export function loadGoogleAdapterConfig(env: NodeJS.ProcessEnv, transport: GoogleAdapterConfig["transport"], now: () => string): GoogleAdapterConfig {
  return {
    clientId: env["GOOGLE_OAUTH_CLIENT_ID"] ?? "",
    clientSecret: env["GOOGLE_OAUTH_CLIENT_SECRET"] ?? "",
    defaultRedirectUri: env["GOOGLE_OAUTH_REDIRECT_URI"] ?? "",
    transport,
    now,
    timeoutMs: 15_000,
  };
}
