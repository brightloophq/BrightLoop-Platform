/* =============================================================================
 * Communication connectors — generic OAuth 2.0 (F4.3).
 *
 * One Authorization-Code implementation parameterized by a provider's OAuth
 * endpoints (Slack, Teams). Client id/secret are APP-level config injected at the
 * composition root — never per-tenant, never persisted here. Access + refresh
 * tokens are returned in the neutral OAuthTokenBundle and stored ONLY through the
 * ConnectorSecretStore by the application. Nothing here writes a secret.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type BuildAuthorizationUrlInput, type ConnectorResult, type ExchangeCodeInput,
  type OAuthTokenBundle, type RefreshTokenInput,
} from "@brightloop/domain";
import { callTokenEndpoint, type CommConfig, type CommProviderBinding, type ProviderCreds } from "./client.js";

const enc = (v: string): string => encodeURIComponent(v);

function endpoints(binding: CommProviderBinding) {
  if (binding.oauth === undefined) throw new Error(`${binding.connectorId} is not an OAuth provider`);
  return binding.oauth;
}

/** Build a provider consent URL. Deterministic given its inputs. */
export function buildCommAuthorizationUrl(cfg: CommConfig, binding: CommProviderBinding, creds: ProviderCreds, input: BuildAuthorizationUrlInput): ConnectorResult<string> {
  if (creds.clientId.length === 0) return connectorErr("config_invalid", `${binding.connectorId} oauth client id is not configured`, "no_client_id");
  const oauth = endpoints(binding);
  const redirectUri = input.redirectUri.length > 0 ? input.redirectUri : cfg.defaultRedirectUri;
  const params = [
    `client_id=${enc(creds.clientId)}`,
    `redirect_uri=${enc(redirectUri)}`,
    `response_type=code`,
    `${oauth.scopeParam}=${enc(input.scopes.join(" "))}`,
    `state=${enc(input.state)}`,
  ];
  for (const [k, v] of Object.entries(oauth.extraAuthParams ?? {})) params.push(`${enc(k)}=${enc(v)}`);
  return connectorOk(`${oauth.authorizeEndpoint}?${params.join("&")}`);
}

function expiryFrom(cfg: CommConfig, expiresIn: unknown): string | null {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn)) return null;
  const base = Date.parse(cfg.now());
  if (Number.isNaN(base)) return null;
  return new Date(base + expiresIn * 1000).toISOString();
}

function toBundle(cfg: CommConfig, oauth: ReturnType<typeof endpoints>, json: Record<string, unknown>, fallbackRefresh: string | null): OAuthTokenBundle {
  const path = oauth.accessTokenPath ?? "access_token";
  const at = json[path];
  const accessToken = typeof at === "string" ? at : "";
  const refreshToken = typeof json["refresh_token"] === "string" ? (json["refresh_token"] as string) : fallbackRefresh;
  const scope = typeof json["scope"] === "string" ? (json["scope"] as string) : "";
  const tokenType = typeof json["token_type"] === "string" ? (json["token_type"] as string) : "Bearer";
  return { accessToken, refreshToken, scopes: scope.length > 0 ? scope.split(" ") : [], expiresAt: expiryFrom(cfg, json["expires_in"]), tokenType };
}

/** Exchange an authorization code for a token bundle. */
export async function exchangeCommCode(cfg: CommConfig, binding: CommProviderBinding, creds: ProviderCreds, input: ExchangeCodeInput): Promise<ConnectorResult<OAuthTokenBundle>> {
  if (input.code.length === 0) return connectorErr("validation", "empty authorization code", "no_code");
  const oauth = endpoints(binding);
  const redirectUri = input.redirectUri.length > 0 ? input.redirectUri : cfg.defaultRedirectUri;
  const res = await callTokenEndpoint(cfg, oauth.tokenEndpoint, {
    code: input.code, client_id: creds.clientId, client_secret: creds.clientSecret,
    redirect_uri: redirectUri, grant_type: "authorization_code", ...(oauth.extraTokenParams ?? {}),
  }, binding.classify);
  if (!res.ok) return res;
  const bundle = toBundle(cfg, oauth, res.value, null);
  if (bundle.accessToken.length === 0) return connectorErr("validation", "token endpoint returned no access token", "no_access_token");
  return connectorOk(bundle);
}

/** Refresh an access token (providers may not re-issue a refresh token). */
export async function refreshCommToken(cfg: CommConfig, binding: CommProviderBinding, creds: ProviderCreds, input: RefreshTokenInput): Promise<ConnectorResult<OAuthTokenBundle>> {
  if (input.refreshToken.length === 0) return connectorErr("authorization", "empty refresh token", "no_refresh");
  const oauth = endpoints(binding);
  const res = await callTokenEndpoint(cfg, oauth.tokenEndpoint, {
    refresh_token: input.refreshToken, client_id: creds.clientId, client_secret: creds.clientSecret,
    grant_type: "refresh_token", ...(oauth.extraTokenParams ?? {}),
  }, binding.classify);
  if (!res.ok) return res;
  const bundle = toBundle(cfg, oauth, res.value, input.refreshToken);
  if (bundle.accessToken.length === 0) return connectorErr("authentication", "refresh returned no access token", "no_access_token");
  return connectorOk(bundle);
}
