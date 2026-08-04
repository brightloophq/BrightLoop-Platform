/* =============================================================================
 * Social connectors — generic OAuth 2.0 authorization-code flow (F4.7).
 *
 * One Authorization-Code implementation parameterized by a provider's OAuth endpoints
 * (Meta, LinkedIn, X, TikTok). Client id/secret are APP-level config injected at the
 * composition root — never per-tenant, never persisted here. Access + refresh tokens
 * are returned in the neutral OAuthTokenBundle and stored ONLY through the
 * ConnectorSecretStore by the application; token refresh + rotation is driven by the
 * framework's `resolveConnectorSecret`. Nothing here writes a secret.
 *
 * Provider knobs are read from the binding's `oauth` descriptor: the client-credential
 * param name (`client_id` vs TikTok's `client_key`), the scope separator (space vs
 * comma), and the token-endpoint auth style (form body vs HTTP Basic for X). The
 * per-request PKCE `code_verifier` that X requires is NOT threaded by the synchronous
 * OAuth port — see the F4.7 report's known limitations.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type BuildAuthorizationUrlInput, type ConnectorResult, type ExchangeCodeInput,
  type OAuthTokenBundle, type RefreshTokenInput,
} from "@brightloop/domain";
import { callTokenEndpoint, type SocialConfig, type SocialProviderBinding, type ProviderCreds } from "./client.js";

const enc = (v: string): string => encodeURIComponent(v);

/**
 * Split OAuth client credentials between the form body and headers per the binding's
 * `tokenAuthStyle`. `basic` sends `Authorization: Basic base64(id:secret)` with no
 * creds in the body (X/Twitter confidential clients); `body` (default for social)
 * sends them as form params under the configured param names.
 */
function credentialParts(binding: SocialProviderBinding, creds: ProviderCreds): { form: Record<string, string>; headers?: Record<string, string> } {
  const idParam = binding.oauth.clientIdParam ?? "client_id";
  const secretParam = binding.oauth.clientSecretParam ?? "client_secret";
  if ((binding.oauth.tokenAuthStyle ?? "body") === "basic") {
    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
    // X still requires the client id in the body alongside Basic auth.
    return { form: { [idParam]: creds.clientId }, headers: { authorization: `Basic ${basic}` } };
  }
  return { form: { [idParam]: creds.clientId, [secretParam]: creds.clientSecret } };
}

/** Build a provider consent URL. Deterministic given its inputs. */
export function buildSocialAuthorizationUrl(cfg: SocialConfig, binding: SocialProviderBinding, creds: ProviderCreds, input: BuildAuthorizationUrlInput): ConnectorResult<string> {
  if (creds.clientId.length === 0) return connectorErr("config_invalid", `${binding.connectorId} oauth client id is not configured`, "no_client_id");
  const oauth = binding.oauth;
  const redirectUri = input.redirectUri.length > 0 ? input.redirectUri : cfg.defaultRedirectUri;
  const scopeParam = oauth.scopeParam ?? "scope";
  const scopeSep = oauth.scopeSeparator ?? " ";
  const idParam = oauth.clientIdParam ?? "client_id";
  const params = [
    `${enc(idParam)}=${enc(creds.clientId)}`,
    `redirect_uri=${enc(redirectUri)}`,
    `response_type=${enc(oauth.responseType ?? "code")}`,
    `${enc(scopeParam)}=${enc(input.scopes.join(scopeSep))}`,
    `state=${enc(input.state)}`,
  ];
  for (const [k, v] of Object.entries(oauth.extraAuthParams ?? {})) params.push(`${enc(k)}=${enc(v)}`);
  return connectorOk(`${oauth.authorizeEndpoint}?${params.join("&")}`);
}

function expiryFrom(cfg: SocialConfig, expiresIn: unknown): string | null {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn)) return null;
  const base = Date.parse(cfg.now());
  if (Number.isNaN(base)) return null;
  return new Date(base + expiresIn * 1000).toISOString();
}

function toBundle(cfg: SocialConfig, json: Record<string, unknown>, fallbackRefresh: string | null): OAuthTokenBundle {
  const at = json["access_token"];
  const accessToken = typeof at === "string" ? at : "";
  const refreshToken = typeof json["refresh_token"] === "string" ? (json["refresh_token"] as string) : fallbackRefresh;
  const scope = typeof json["scope"] === "string" ? (json["scope"] as string) : "";
  const tokenType = typeof json["token_type"] === "string" ? (json["token_type"] as string) : "Bearer";
  // Meta + TikTok comma-join scopes; space-join is the default. Split on either.
  const scopes = scope.length > 0 ? scope.split(/[\s,]+/).filter((s) => s.length > 0) : [];
  return { accessToken, refreshToken, scopes, expiresAt: expiryFrom(cfg, json["expires_in"]), tokenType };
}

/** Exchange an authorization code for a token bundle. */
export async function exchangeSocialCode(cfg: SocialConfig, binding: SocialProviderBinding, creds: ProviderCreds, input: ExchangeCodeInput): Promise<ConnectorResult<OAuthTokenBundle>> {
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

/** Refresh an access token (providers that rotate the refresh token return a new one). */
export async function refreshSocialToken(cfg: SocialConfig, binding: SocialProviderBinding, creds: ProviderCreds, input: RefreshTokenInput): Promise<ConnectorResult<OAuthTokenBundle>> {
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
