# Phase F · Sprint F4.7 — Social Connectors

The **Social production connector family** on the F4.1 Integration Platform:
**Meta (Facebook + Instagram)**, **LinkedIn**, **X (Twitter)**, and **TikTok**. Built
as a **pure additive connector family** — no change to the F4.1 framework, the
F4.2–F4.6 execution model, the database, RLS, capabilities, roles, or DTOs. Social
connectors feel native because they reuse every existing abstraction.

Branched off `main` **after** merging the F4.6 Finance prerequisite (`#72`). The one
additive schema touch: `connectorCategorySchema` gained a new `"social"` member. That
enum is **not persisted in the database** (connector `category` lives only in the
in-memory registry + Zod), so there is **no migration, pgTAP, RLS, or generated-type
impact**.

---

## 1. Architecture summary

```
Marketplace / Copilot / Runtime
        │  (unchanged application use-cases: install · configure · validate ·
        │   health · invoke · webhook-ingest · poll · OAuth begin/complete)
        ▼
@brightloop/application/integration  ── generic, provider-agnostic
        │  ConnectorAdapter port (F4.1) + execute() (F4.2) + resolveConnectorSecret
        │  OAuth refresh/rotation (F4.2)
        ▼
@brightloop/data/integration/social  ── ONE generic engine + 4 bindings
   client.ts (callSocial, authorize, callTokenEndpoint)   errors.ts
   oauth.ts (generic auth-code; body OR Basic client-auth; client_key/scope knobs)
   normalize.ts   contracts.ts   helpers.ts   webhook.ts (Meta HMAC-SHA256 hex)
   meta.ts   linkedin.ts   x.ts   tiktok.ts   adapter.ts (assembly)
        ▼
   Facebook Graph · LinkedIn REST · X API v2 · TikTok API v2  (only via transport seam)
```

The social family follows the F4.5/F4.6 binding pattern: one generic engine
(`callSocial` + `SocialProviderBinding`) drives all four providers over OAuth 2.0
authorization-code, with the provider-specific surface confined to a single binding
object per vendor. The engine gained two small OAuth knobs the finance family did not
need — `clientIdParam`/`clientSecretParam` (TikTok names its credential `client_key`)
and `scopeSeparator` (Meta + TikTok comma-join scopes) — declared on the binding's
`oauth` descriptor, not threaded through the framework.

## 2. Connectors implemented

| id | Vendor | Auth | Triggers | Capabilities |
|----|--------|------|----------|--------------|
| `meta` | Meta | OAuth2 (body) | webhook + polling | 13 |
| `linkedin` | LinkedIn | OAuth2 (body) | polling | 11 |
| `x` | X | OAuth2 (Basic) | polling | 10 |
| `tiktok` | TikTok | OAuth2 (body, `client_key`) | polling | 8 |

## 3. Normalized capability matrix (`social.*`)

Every provider exposes a SUBSET of the shared vocabulary under identical `operation`
names; no provider-specific capability, query, or payload is exposed.

| capability | meta | linkedin | x | tiktok |
|---|:---:|:---:|:---:|:---:|
| social.profile.read | ✓ | ✓ | ✓ | ✓ |
| social.pages.list | ✓ | | | |
| social.accounts.list | ✓ | ✓ | | ✓ |
| social.posts.list | ✓ | ✓ | ✓ | ✓ |
| social.posts.read | ✓ | ✓ | ✓ | ✓ |
| social.posts.create | ✓ | ✓ | ✓ | |
| social.posts.publish | ✓ | | | ✓ |
| social.posts.delete | ✓ | ✓ | ✓ | |
| social.comments.list | ✓ | ✓ | | |
| social.comments.reply | ✓ | ✓ | ✓ | |
| social.media.upload | ✓ | ✓ | ✓ | ✓ |
| social.insights.read | ✓ | | | |
| social.analytics.read | | ✓ | ✓ | ✓ |
| social.search.read | | | ✓ | |
| social.health | ✓ | ✓ | ✓ | ✓ |

Documented normalized-subset asymmetries (mirrors F4.5 Salesforce-leads / F4.6
QuickBooks-refund): only Meta lists Pages + reads insights; only X exposes search; Meta
+ TikTok publish where LinkedIn + X create; Meta uses `insights` where the others use
`analytics`.

## 4. Normalized contracts

`SocialProfile · SocialAccount · SocialPage · SocialPost · SocialComment · SocialMedia
· SocialAnalytics · SocialHealth · SocialSearchResult` — the neutral value objects each
binding maps INTO. Provider field names/ids/shapes are read inside the binding and never
leave the adapter; extra safe fields survive only inside a bounded `metadata` object.

## 5. Event translation

Provider shapes stay inside adapters; the canonical vocabulary is `social.post.created /
.published / .updated / .deleted`, `social.comment.created / .replied`,
`social.mention.received`, `social.reaction.received`, `social.event.received`.

- **Facebook post published** → `social.post.published` (Meta `entry[].changes[]`,
  `field=feed`, `verb=add`)
- **Instagram comment created** → `social.comment.created` (Meta `field=comments`)
- **LinkedIn organization post** → `social.post.created` (polled)
- X polled tweets → `social.post.published`; TikTok polled videos → `social.post.published`

## 6. Webhook + polling support

- **Meta** — body-signed webhook: `X-Hub-Signature-256` = HMAC-SHA256(rawBody,
  appSecret) as lower-case hex with a `sha256=` prefix, verified constant-time; plus
  page-feed polling (cursor = Graph `after` token).
- **LinkedIn / X / TikTok** — polling only (no body-signed webhook of the shape the
  synchronous port can verify). Cursors: LinkedIn start-index, X `next_token`, TikTok
  numeric cursor.

All webhook + polling ingestion runs through the unchanged F4.1 `ingestConnectorWebhook`
/ `pollConnector` use-cases (idempotent; replay = duplicate).

## 7. Authentication + secret management

All four are OAuth 2.0 authorization-code, reusing the F4.1 OAuth framework +
`resolveConnectorSecret` refresh/rotation. App-level client credentials come from the
environment (`META_/LINKEDIN_/X_CLIENT_ID|SECRET`, `TIKTOK_CLIENT_KEY|SECRET`) and are
never per-tenant, never persisted. Access + refresh tokens are per-installation secrets
stored ONLY by reference via `ConnectorSecretStore` (purpose `oauth_token`). The optional
Meta app secret is stored under the `webhook_signing` purpose. No access/refresh token,
client secret, page token, or business token is ever exposed in a DTO, log, or error.

## 8. Health model

Seven states via the F4.1 snapshot `detail.reason`
(connected/healthy · disconnected · expired · permission_missing · rate_limited ·
configuration_error), derived from a pure HTTP-status classifier. TikTok additionally
classifies its HTTP-200 `error.code` envelope (like the F4.3 Slack `{ok:false}` case).

## 9. Authorization + Copilot

Invocation flows through the existing `integration.invoke` funnel — clients cannot
invoke; tenant + workspace isolation and RLS are unchanged. Copilot is provider-neutral
by construction: it operates over the normalized `social.*` capability vocabulary via
`invokeConnectorCapability`, so no per-family Copilot code was added (consistent with
F4.2–F4.6).

## 10. Marketplace

`getConnectorAdapterRegistry` merges Fakes + Google + Communication + Commerce + CRM +
Finance + Social. Marketplace/detail are registry-driven, so the four social connectors
appear, install, connect, reconnect, and disconnect automatically. No web/DB change.

## 11. Database + RLS

**No migration, no pgTAP change, no RLS change, no generated-type change.** The single
schema edit is the additive `"social"` Zod enum member, which is not a persisted column.

## 12. Tests

- **Domain** `+1` block (`integration.test.ts` → 29 tests): all four registered,
  normalized, OAuth2, `social` category; subset asymmetries; trigger kinds.
- **Data** `+33` (`social/social.test.ts`): 7-state classification incl. safe-code
  extraction; Bearer + version headers; OAuth authorize URL (comma vs space scopes,
  `client_id` vs `client_key`), body vs HTTP-Basic exchange, refresh rotation, expiry;
  normalized ops + execute dispatch; **real X-Hub-Signature-256 hex vector** + Meta event
  translation; TikTok HTTP-200 error envelope; per-provider polling cursor advance;
  transport-failure mapping; secret non-leak.
- **Application** `+11` (`integration-social.test.ts`): install + OAuth connect +
  transparent refresh/rotation + revoked-token reconnect; read + write invocation +
  audit; client + scope denial; webhook verify/translate/idempotent-replay; polling
  replay-safety; secret non-leak.

**ZERO live Meta/LinkedIn/X/TikTok calls in CI** — every test drives a deterministic fake
transport.

## 13. Known limitations / deferred work

- **Media upload is metadata/handle-only** — each `social.media.upload` initializes the
  provider upload (returns a media/publish handle); binary chunk transfer is out of scope
  for the synchronous port.
- **X PKCE `code_verifier`** — X OAuth requires PKCE; the per-request `code_verifier` is
  not threaded by the synchronous OAuth port. The authorize URL advertises
  `code_challenge_method=plain` for completeness; full PKCE is deferred.
- **Meta long-lived token exchange** — refresh runs the generic `grant_type=refresh_token`
  path; Meta's distinct long-lived-token exchange is deferred (documented, not faked).
- **LinkedIn/X/TikTok are polling-not-push** — no body-signed webhook of the verifiable
  shape; Meta is the only push provider.
