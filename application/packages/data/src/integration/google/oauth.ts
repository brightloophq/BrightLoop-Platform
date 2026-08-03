/* =============================================================================
 * Google connectors — OAuth 2.0 Authorization Code flow (F4.2).
 *
 * Authorization URL (offline access + consent so a refresh token is issued), code
 * exchange, and refresh. Client id/secret are APP-level config injected at the
 * composition root — never per-tenant, never persisted here. Access + refresh
 * tokens are returned in the neutral OAuthTokenBundle and stored ONLY through the
 * ConnectorSecretStore by the application. Nothing here writes a secret anywhere.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type BuildAuthorizationUrlInput, type ConnectorResult, type ExchangeCodeInput,
  type OAuthTokenBundle, type RefreshTokenInput,
} from "@brightloop/domain";
import { callGoogleForm, type GoogleAdapterConfig } from "./client.js";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

function enc(v: string): string { return encodeURIComponent(v); }

/** Build the Google consent URL. Deterministic given its inputs. */
export function buildGoogleAuthorizationUrl(cfg: GoogleAdapterConfig, input: BuildAuthorizationUrlInput): ConnectorResult<string> {
  if (cfg.clientId.length === 0) return connectorErr("config_invalid", "google oauth client id is not configured", "no_client_id");
  const redirectUri = input.redirectUri.length > 0 ? input.redirectUri : cfg.defaultRedirectUri;
  const params = [
    `client_id=${enc(cfg.clientId)}`,
    `redirect_uri=${enc(redirectUri)}`,
    `response_type=code`,
    `scope=${enc(input.scopes.join(" "))}`,
    `state=${enc(input.state)}`,
    `access_type=offline`,
    `include_granted_scopes=true`,
    `prompt=consent`,
  ];
  return connectorOk(`${AUTH_ENDPOINT}?${params.join("&")}`);
}

/** ISO expiry from an `expires_in` (seconds), relative to the injected clock. */
function expiryFrom(cfg: GoogleAdapterConfig, expiresIn: unknown): string | null {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn)) return null;
  const base = Date.parse(cfg.now());
  if (Number.isNaN(base)) return null;
  return new Date(base + expiresIn * 1000).toISOString();
}

function toBundle(cfg: GoogleAdapterConfig, json: Record<string, unknown>, fallbackRefresh: string | null): OAuthTokenBundle {
  const accessToken = typeof json["access_token"] === "string" ? (json["access_token"] as string) : "";
  const refreshToken = typeof json["refresh_token"] === "string" ? (json["refresh_token"] as string) : fallbackRefresh;
  const scope = typeof json["scope"] === "string" ? (json["scope"] as string) : "";
  const tokenType = typeof json["token_type"] === "string" ? (json["token_type"] as string) : "Bearer";
  return { accessToken, refreshToken, scopes: scope.length > 0 ? scope.split(" ") : [], expiresAt: expiryFrom(cfg, json["expires_in"]), tokenType };
}

/** Exchange an authorization code for a token bundle (incl. a refresh token). */
export async function exchangeGoogleCode(cfg: GoogleAdapterConfig, input: ExchangeCodeInput): Promise<ConnectorResult<OAuthTokenBundle>> {
  if (input.code.length === 0) return connectorErr("validation", "empty authorization code", "no_code");
  const redirectUri = input.redirectUri.length > 0 ? input.redirectUri : cfg.defaultRedirectUri;
  const res = await callGoogleForm(cfg, TOKEN_ENDPOINT, {
    code: input.code, client_id: cfg.clientId, client_secret: cfg.clientSecret,
    redirect_uri: redirectUri, grant_type: "authorization_code",
  });
  if (!res.ok) return res;
  const bundle = toBundle(cfg, res.value, null);
  if (bundle.accessToken.length === 0) return connectorErr("validation", "token endpoint returned no access token", "no_access_token");
  return connectorOk(bundle);
}

/** Refresh an access token (Google does not always re-issue a refresh token). */
export async function refreshGoogleToken(cfg: GoogleAdapterConfig, input: RefreshTokenInput): Promise<ConnectorResult<OAuthTokenBundle>> {
  if (input.refreshToken.length === 0) return connectorErr("authorization", "empty refresh token", "no_refresh");
  const res = await callGoogleForm(cfg, TOKEN_ENDPOINT, {
    refresh_token: input.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
  if (!res.ok) return res;
  const bundle = toBundle(cfg, res.value, input.refreshToken);
  if (bundle.accessToken.length === 0) return connectorErr("authentication", "refresh returned no access token", "no_access_token");
  return connectorOk(bundle);
}
