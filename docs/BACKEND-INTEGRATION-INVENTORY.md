# Backend Integration Inventory (Frozen Reference)

> Companion to **BRIGHTLOOP-FROZEN-BASELINE.md**. Exhaustive map of every backend connection the
> new Auxion frontend must speak to. Root: `application/`. All paths relative to it.
>
> **Authorization is layered: middleware → layout guard → service-layer capability → RLS**, with the
> JWT (stamped by a DB hook) as the single source of role truth. A new frontend inherits all of it —
> it must not try to re-implement or bypass any layer.

---

## 1. Supabase clients — `apps/web/src/lib/supabase/`

Env read via `apps/web/src/lib/env.ts` (`env.supabaseUrl`, `env.supabasePublishableKey`); the service client reads the secret directly.

| File | Export | Key | Session / cookies | RLS |
|---|---|---|---|---|
| `supabase/server.ts` | `createClient()` (async) | Publishable (anon) | `createServerClient` (`@supabase/ssr`) bound to `next/headers` cookies (`getAll`/`setAll`); request-scoped. `setAll` swallows the read-only-cookie throw in RSC. | ✅ applies (caller JWT) |
| `supabase/client.ts` | `createClient()` | Publishable | `"use client"`; `createBrowserClient<Database>`; cookie session shared with server. | ✅ applies |
| `supabase/middleware.ts` | `updateSession(request)` → `{response, claims}` | Publishable | Bound to `NextRequest` cookies; refreshes session each request; returns **verified claims** via `getClaims()` (ES256 vs JWKS). Fails closed when unconfigured. | ✅ applies |
| `supabase/service.ts` | `createServiceRoleClient()` | **Service-role** `SUPABASE_SECRET_KEY` | `"server-only"`; `persistSession:false`. **BYPASSES RLS.** Throws if unset. Webhook/signup only. | ❌ bypassed |
| `supabase/anon.ts` | `createAnonClient()` | Publishable | `"server-only"`; cookie-less; runs strictly as `anon`. Build-time static params / public content. | ✅ (anon) |

**Repository seam:**
- `apps/web/src/lib/repositories.ts` — `getReputationRepository()` (anon, public pages) vs `getAuthedReputationRepository()` (cookie server client, admin CMS sees drafts).
- `packages/data/src/index.ts` — `createReputationRepository()` is the single persistence seam; **throws** if `source:"supabase"` without an injected request-scoped client (never silently falls back to placeholder). Nothing cached across requests (would pin one user's session).

---

## 2. Auth & authorization helpers

**Role comes from the JWT, never the user record.** DB hook `public.custom_access_token_hook(event jsonb)` (`supabase/migrations/20260716000500_auth_claims.sql`) reads `public.users.role` + `client_id` → stamps `claims.app_metadata.{role, client_id}` at token issue. No role → no claim → RLS denies all (fail-closed). Registered as the Supabase Custom Access Token hook; only `supabase_auth_admin` may execute. The app reads `getClaims()` (== `auth.jwt()` in Postgres), not `getUser()`.

- **`apps/web/src/lib/surfaces.ts`** — `Surface = "public"|"portal"|"admin"`; `SURFACE_ROLES = { portal:[client_admin,client_member], admin:[owner,admin,team_member] }`; `surfaceFromHost`, `surfaceFromPath`, `roleFromClaims`, `clientIdFromClaims` (null for internal roles), `roleAllowedOn`.
- **`apps/web/src/lib/auth.ts`** — `getActor(): Actor|null` (`{userId, role, clientId}`; a client role with null `client_id` is malformed → null); `requireSurface(surface): Actor` (layout guard = check 2 of 3; redirects unauthorized to `/login?next=` or the actor's own surface).
- **`apps/web/src/middleware.ts`** — check 1 of 3 (routing + first gate).
- **`packages/domain/src/capabilities.ts`** — `Actor`; `assertCapability` (→ `AuthorizationError` 403); `assertOwnClient` (→ `ClientScopeError` 403; internal roles pass); `assertCanActOnClient`; `may` (non-throwing UI gate).
- **`packages/domain/src/guard.ts`** — `assertTransition` (→ `TransitionError` 409); `transition(input, clock)` → `TransitionRecord`; `allowedTransitions`.
- **`packages/schema/src/roles.ts`** — SINGLE SOURCE OF TRUTH: `ROLES`, `PERMISSIONS` matrix (`owner:["*"]`, wildcard `x.*`, client caps prefixed `own.`), `isRole`, `isInternalRole`, `isClientRole`, `hasCapability`.

**Admin vs client, precisely:** internal roles = broad namespaced caps, capability-scoped. Client roles = only `own.*` caps, additionally row-scoped by RLS to `auth.client_id`.

---

## 3. Webhook endpoints — `apps/web/src/app/api/webhooks/` (POST)

Discipline (all three): **verify signature over the RAW body FIRST → 401 on failure**, then guard the state move with `can(...)`, then write via service-role (RLS bypassed, DB transition trigger still fires). Return **503 if the secret is unset** (fail closed).

**Signature helper — `apps/web/src/lib/webhook-signature.ts`** (`"server-only"`):
- `verifyHmacSignature(rawBody, signature, secret)` — **HMAC-SHA256**: `createHmac("sha256", secret).update(rawBody,"utf8").digest("hex")`. Strips optional `sha256=` prefix; constant-time `timingSafeEqual` over hex; rejects on length mismatch/empty.
- `signHmac(rawBody, secret)` — signing counterpart.

Payment & signature routes verify via `provider.verifyWebhookSignature(...)` on the pluggable adapter (mock accepts only the literal `"mock-valid-signature"`; real Stripe/e-sign adapters implement provider-native verification).

| Route | Receives | Secret | Header(s) | Effect |
|---|---|---|---|---|
| `api/webhooks/n8n/route.ts` | `{automationId, to, error?, runIncrement?}` | `N8N_WEBHOOK_SECRET` | `x-bl-signature` → `x-signature` | HMAC verify; loads current `automations.status` (never trusts `from`); `can("automation", from, to)` (409 illegal); patches `status/last_run_at/runs/last_error` (DB `23514` → 409). |
| `api/webhooks/payments/route.ts` | `{invoiceId, amount, last4?, method?, providerRef?, outcome?}` | `STRIPE_WEBHOOK_SECRET` (`paymentWebhookSecret()`) | `stripe-signature` → `x-bl-signature` | `selectPaymentProvider().verifyWebhookSignature`; non-`succeeded` ignored; `settlePaymentSucceeded` (`lib/settle.ts`) guards invoice move + activation. |
| `api/webhooks/signatures/route.ts` | `{contractId, event, signatureName?}`; events `signed`, `countersigned` | `ESIGN_WEBHOOK_SECRET` (`signatureWebhookSecret()`) | `x-esign-signature` → `x-bl-signature` | `selectSignatureProvider().verifyWebhookSignature`; `signed`→`signed_client`; `countersigned`→`countersigned`→`active` then `rpc("bl_activate_client")`; each `move()` guards `can("contract",…)` + writes `transition_log`. |

Related (not a webhook): `api/attachments/[id]/route.ts` — GET; **session** client (RLS decides visibility); returns a 60s Supabase Storage signed-URL redirect for the `attachments` bucket.

---

## 4. n8n integration

Contract (`packages/domain/src/adapters/automation.ts`): **the app owns state; n8n only notifies.**
- `AutomationProvider` port: `trigger(input)` (outbound) + `verifyCallbackSignature(rawBody, signature, secret)`. `TriggerWorkflowInput = {workflow, payload, automationId}`, `TriggerResult = {ok, runRef}`. Only `MockAutomationProvider` exists (`run_mock_N`, sentinel signature). **No concrete outbound n8n HTTP trigger is implemented yet.**
- Inbound callback: `/api/webhooks/n8n` (§3) — HMAC-SHA256, header `x-bl-signature`/`x-signature`, secret `N8N_WEBHOOK_SECRET`, payload `{automationId, to, error?, runIncrement?}` → `automations` table / `automation` machine.
- Monitoring UI: `apps/web/src/app/admin/automation/page.tsx` (`force-dynamic`) — reads `automations` (session client), surfaces `failed` runs + `last_error`, documents the callback contract.
- Env: `N8N_WEBHOOK_SECRET` (used); `N8N_WEBHOOK_BASE_URL` (documented, **unused** — outbound unbuilt).

---

## 5. Turnstile (Cloudflare abuse-gate)

Gates the public signup endpoint only.
- Server verify: `apps/web/src/lib/turnstile.ts` (`"server-only"`). `isTurnstileEnforced()` = `Boolean(TURNSTILE_SECRET_KEY)`. `verifyTurnstile(token)` — no secret → NO-OP `{ok:true}`; else POST `https://challenges.cloudflare.com/turnstile/v0/siteverify` (form-urlencoded `{secret, response}`); missing/failed → `{ok:false}`; **network error → fails closed**.
- Toggle: presence of `TURNSTILE_SECRET_KEY`.
- Widget: `apps/web/src/app/(public)/start/TurnstileWidget.tsx` (`"use client"`) — reads `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; renders nothing if unset; loads `api.js?render=explicit`; writes hidden `turnstileToken` input.
- Gated form: signup action `apps/web/src/app/(public)/start/actions.ts` calls `verifyTurnstile(...)` before `createUser(...)`.
- CSP: `apps/web/next.config.mjs` whitelists `challenges.cloudflare.com` in `script-src`/`frame-src`/`connect-src`.

---

## 6. Email pipeline

`apps/web/src/lib/email.ts` (`"server-only"`). Real pipeline (event → template → consent gate → provider); provider pluggable, default `MockEmailProvider` (`packages/domain/src/adapters/email.ts`).
- `selectProvider()` — mock until `EMAIL_PROVIDER_API_KEY` (commented `ResendEmailProvider` hook).
- `dispatchEmail(input & {userId?})` — **consent gate**: `kind:"marketing"` requires a `userId` + a granted latest `consents` row (`type="marketing"`, append-only latest-wins); dropped otherwise. Transactional always sends. Best-effort (never throws into a business action).
- `hasMarketingConsent(userId)`; `isEmailConfigured()` = `Boolean(EMAIL_PROVIDER_API_KEY)`.
- Note: Supabase's built-in auth mailer (magic link / recovery) is separate (2 emails/hour dev ceiling until a provider/custom SMTP is set).

---

## 7. Environment variables — complete table

Every `process.env.*` reference in application source (excluding `node_modules`/`.next`).

| Env var | Where used | Purpose | Req/Opt | Public/Secret |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/env.ts`, `lib/supabase/*`, `next.config.mjs` (CSP) | Supabase URL; builds CSP connect-src | **Required** | Public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `lib/env.ts` → all clients | Publishable/anon key; RLS applies | **Required** | Public |
| `SUPABASE_SECRET_KEY` | `lib/supabase/service.ts` | Service-role key; bypasses RLS (webhooks/signup) | **Required** (server) | **Secret** |
| `NEXT_PUBLIC_SITE_URL` | `lib/site-url.ts` | Base origin for auth redirect links; validated + allow-listed | Optional (Vercel/localhost fallback) | Public |
| `NEXT_PUBLIC_PUBLIC_HOST` | `lib/env.ts` | Public host (default `brightloop.co`) | Optional | Public |
| `NEXT_PUBLIC_PORTAL_HOST` | `lib/env.ts` | Portal host (default `app.brightloop.co`) | Optional | Public |
| `NEXT_PUBLIC_ADMIN_HOST` | `lib/env.ts` | Admin host (default `admin.brightloop.co`) | Optional | Public |
| `STRIPE_SECRET_KEY` | `lib/payments.ts` | Real Stripe vs mock | Optional (mock until set) | **Secret** |
| `STRIPE_WEBHOOK_SECRET` | `lib/payments.ts` | Verify `/api/webhooks/payments` | Optional (503 without) | **Secret** |
| `TURNSTILE_SECRET_KEY` | `lib/turnstile.ts` | Enforce + verify Turnstile | Optional (no-op until set) | **Secret** |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `start/TurnstileWidget.tsx` | Render widget | Optional | Public |
| `N8N_WEBHOOK_SECRET` | `api/webhooks/n8n/route.ts` | HMAC secret for callbacks | Optional (503 without) | **Secret** |
| `ESIGN_API_KEY` | `lib/signatures.ts` | Real e-sign vs mock | Optional | **Secret** |
| `ESIGN_WEBHOOK_SECRET` | `lib/signatures.ts` | Verify `/api/webhooks/signatures` | Optional (503 without) | **Secret** |
| `EMAIL_PROVIDER_API_KEY` | `lib/email.ts` | Real email vs mock | Optional | **Secret** |
| `BRIGHTLOOP_DATA_SOURCE` | `lib/repositories.ts` | `"placeholder"` = dev without DB; else Supabase (default) | Optional | Secret (server-only) |

**Documented in `.env.example`, not referenced in code (reserved):** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (Stripe.js front-end unbuilt), `N8N_WEBHOOK_BASE_URL` (outbound unbuilt). **CLI-only (never app runtime):** `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`. **Referenced but undocumented:** none.

`.env.example` lives at `application/.env.example` (repo has none in `apps/web`; real secrets are in gitignored `apps/web/.env.local`).

---

## 8. Cross-cutting notes for the Auxion frontend

- **Defence-in-depth is consistent:** UI (hide/disable) → service layer (`assertCapability`/`assertTransition`) → DB (RLS + transition triggers). A new frontend may hide/disable controls for UX, but **must not** treat that as security — the service + DB layers are authoritative.
- Even the service-role client cannot drive an illegal state transition — RLS is bypassed, the machine guard + DB trigger are not.
- `next.config.mjs` ships CSP/HSTS/Permissions-Policy; only Supabase (REST+WSS) and Cloudflare Turnstile are cross-origin-allowed; `/portal` and `/admin` are `no-store`. **A new frontend must keep these headers** (or the equivalent) — Google Fonts `@import`/CDN scripts are blocked by CSP; self-host via `next/font`.
- All four provider adapters (`packages/domain/src/adapters/{payment,signature,email,automation}.ts`) are ports resolving to deterministic mocks, credential-gated on the secrets above — pipelines are real, vendors pending.
