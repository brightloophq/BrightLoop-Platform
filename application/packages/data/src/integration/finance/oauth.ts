/* =============================================================================
 * Finance connectors — generic OAuth 2.0 authorization-code flow (F4.6).
 *
 * One Authorization-Code implementation parameterized by a provider's OAuth endpoints
 * (QuickBooks Online, Xero). Client id/secret are APP-level config injected at the
 * composition root — never per-tenant, never persisted here. Access + refresh tokens
 * are returned in the neutral OAuthTokenBundle and stored ONLY through the
 * ConnectorSecretStore by the application; token refresh + rotation is driven by the
 * framework's `resolveConnectorSecret`. Nothing here writes a secret.
 *
 * Note: QuickBooks returns the company `realmId` on the authorization redirect and Xero
 * exposes tenants via a separate `/connections` call — but the framework exchange runs
 * with empty config, so the API tenancy (realmId / tenantId) is carried as install
 * config (see each binding + the F4.6 report), not persisted from the token response.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type BuildAuthorizationUrlInput, type ConnectorResult, type ExchangeCodeInput,
  type OAuthTokenBundle, type RefreshTokenInput,
} from "@brightloop/domain";
import { callTokenEndpoint, type FinanceConfig, type FinanceProviderBinding, type ProviderCreds } from "./client.js";

const enc = (v: string): string => encodeURIComponent(v);

/**
 * Split OAuth client credentials between the form body and headers per the binding's
 * `tokenAuthStyle`. `basic` (default for finance) sends `Authorization: Basic
 * base64(id:secret)` with no creds in the body (QuickBooks + Xero); `body` sends them
 * as form params.
 */
function credentialParts(binding: FinanceProviderBinding, creds: ProviderCreds): { form: Record<string, string>; headers?: Record<string, string> } {
  if ((binding.oauth.tokenAuthStyle ?? "basic") === "basic") {
    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
    return { form: {}, headers: { authorization: `Basic ${basic}` } };
  }
  return { form: { client_id: creds.clientId, client_secret: creds.clientSecret } };
}

/** Build a provider consent URL. Deterministic given its inputs. */
export function buildFinanceAuthorizationUrl(cfg: FinanceConfig, binding: FinanceProviderBinding, creds: ProviderCreds, input: BuildAuthorizationUrlInput): ConnectorResult<string> {
  if (creds.clientId.length === 0) return connectorErr("config_invalid", `${binding.connectorId} oauth client id is not configured`, "no_client_id");
  const oauth = binding.oauth;
  const redirectUri = input.redirectUri.length > 0 ? input.redirectUri : cfg.defaultRedirectUri;
  const scopeParam = oauth.scopeParam ?? "scope";
  const params = [
    `client_id=${enc(creds.clientId)}`,
    `redirect_uri=${enc(redirectUri)}`,
    `response_type=code`,
    `${scopeParam}=${enc(input.scopes.join(" "))}`,
    `state=${enc(input.state)}`,
  ];
  for (const [k, v] of Object.entries(oauth.extraAuthParams ?? {})) params.push(`${enc(k)}=${enc(v)}`);
  return connectorOk(`${oauth.authorizeEndpoint}?${params.join("&")}`);
}

function expiryFrom(cfg: FinanceConfig, expiresIn: unknown): string | null {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn)) return null;
  const base = Date.parse(cfg.now());
  if (Number.isNaN(base)) return null;
  return new Date(base + expiresIn * 1000).toISOString();
}

function toBundle(cfg: FinanceConfig, json: Record<string, unknown>, fallbackRefresh: string | null): OAuthTokenBundle {
  const at = json["access_token"];
  const accessToken = typeof at === "string" ? at : "";
  const refreshToken = typeof json["refresh_token"] === "string" ? (json["refresh_token"] as string) : fallbackRefresh;
  const scope = typeof json["scope"] === "string" ? (json["scope"] as string) : "";
  const tokenType = typeof json["token_type"] === "string" ? (json["token_type"] as string) : "Bearer";
  return { accessToken, refreshToken, scopes: scope.length > 0 ? scope.split(" ") : [], expiresAt: expiryFrom(cfg, json["expires_in"]), tokenType };
}

/** Exchange an authorization code for a token bundle. */
export async function exchangeFinanceCode(cfg: FinanceConfig, binding: FinanceProviderBinding, creds: ProviderCreds, input: ExchangeCodeInput): Promise<ConnectorResult<OAuthTokenBundle>> {
  if (input.code.length === 0) return connectorErr("validation", "empty authorization code", "no_code");
  const oauth = binding.oauth;
  const redirectUri = input.redirectUri.length > 0 ? input.redirectUri : cfg.defaultRedirectUri;
  const cred = credentialParts(binding, creds);
  const res = await callTokenEndpoint(cfg, oauth.tokenEndpoint, {
    code: input.code, redirect_uri: redirectUri, grant_type: "authorization_code",
    ...cred.form, ...(oauth.extraTokenParams ?? {}),
  }, binding.classify, cred.headers);
  if (!res.ok) return res;
  const bundle = toBundle(cfg, res.value, null);
  if (bundle.accessToken.length === 0) return connectorErr("validation", "token endpoint returned no access token", "no_access_token");
  return connectorOk(bundle);
}

/** Refresh an access token (both providers rotate the refresh token on each refresh). */
export async function refreshFinanceToken(cfg: FinanceConfig, binding: FinanceProviderBinding, creds: ProviderCreds, input: RefreshTokenInput): Promise<ConnectorResult<OAuthTokenBundle>> {
  if (input.refreshToken.length === 0) return connectorErr("authorization", "empty refresh token", "no_refresh");
  const oauth = binding.oauth;
  const cred = credentialParts(binding, creds);
  const res = await callTokenEndpoint(cfg, oauth.tokenEndpoint, {
    refresh_token: input.refreshToken, grant_type: "refresh_token",
    ...cred.form, ...(oauth.extraTokenParams ?? {}),
  }, binding.classify, cred.headers);
  if (!res.ok) return res;
  const bundle = toBundle(cfg, res.value, input.refreshToken);
  if (bundle.accessToken.length === 0) return connectorErr("authentication", "refresh returned no access token", "no_access_token");
  return connectorOk(bundle);
}
