# BrightLoop Platform — Frozen Baseline (Reference Implementation)

> **Status:** FROZEN reference implementation. This is the last full-stack state of the
> platform captured before the **Auxion** frontend rebuild begins.
>
> **Tag:** `brightloop-frozen-v1`  ·  **Branch:** `main`  ·  **Code freeze commit:** `3401df6` (docs added on top under this tag)
> **Frozen:** 2026-07-17

## 0. What this is and how to use it

The backend, database, domain logic, and integration wiring in this repository are **complete,
tested, and deployed**. The **Auxion** initiative rebuilds the *frontend only*. This document —
plus its three companions — is the contract between the frozen platform and the new frontend:

| Doc | Purpose |
|---|---|
| **BRIGHTLOOP-FROZEN-BASELINE.md** (this file) | Freeze point, quality gate, routes, migrations, RLS, env, verification |
| **BACKEND-INTEGRATION-INVENTORY.md** | Supabase clients, auth/authz, webhooks, n8n, Turnstile, email, env table |
| **REUSABLE-SERVER-MODULES.md** | Exact modules safe to carry into Auxion, with coupling notes |
| **AUXION-MIGRATION-SOURCE-MAP.md** | Reuse vs rebuild map + backend connection requirements + risks |

**Rule for Auxion:** reuse the backend/logic layer verbatim (`packages/{schema,domain,data,db}`,
`apps/web/src/lib/**` server helpers, server actions, migrations). Do **not** carry over any
presentation (`packages/ui`, `*.module.css`, design tokens, page/layout JSX, navigation).

> Naming note: the public brand is **Auxion**, but `@brightloop/*` package names, the `--bl-*`
> CSS variable prefix, and the `brightloop.co` host/DNS config are **intentionally retained** —
> they are internal identifiers and infrastructure, not brand copy. Do not rename them.

---

## 1. Quality gate — PASS

Run: `pnpm turbo run lint typecheck test build` (from `application/`). Result: **24/24 tasks successful, exit 0.**

| Gate | Result |
|---|---|
| **lint** (eslint) | ✅ pass — all 6 packages |
| **typecheck** (tsc --noEmit) | ✅ pass — all 6 packages |
| **tests** (vitest) | ✅ **226 passing** |
| **production build** (next build) | ✅ pass — 31 pages generated, 0 errors |

Test breakdown:

| Package | Tests | Notable suites |
|---|---|---|
| `@brightloop/schema` | 17 | roles (9), machines (8) |
| `@brightloop/domain` | 121 | reputation query (34), pricing (13), funnel (16), seo (16), analytics (8), capabilities (9), guard (8), quote (6), facets (11) |
| `@brightloop/data` | 47 | mappers (16), reputation repo (18), catalog repo (13) |
| `@brightloop/web` | 34 | portfolio-params (23), surfaces (11) |
| `@brightloop/ui` | 7 | Pagination (7) |
| `@brightloop/db` | — | migrations verified on apply (no unit suite) |
| **Total** | **226** | |

> The e2e/authorization behaviors below are verified by these suites + the DB layer, not by a
> live browser run. Live auth/RLS behavior is additionally proven by the deployed environment.

---

## 2. Stack

- **Monorepo:** pnpm workspaces + Turborepo. Workspace root: `application/`. Repo root has no `package.json`.
- **App:** `apps/web` — Next.js 15.5 App Router, React 19, SSR + middleware (PKCE).
- **Packages:** `@brightloop/{schema, domain, data, db, ui}`. `schema/domain/data/db` are consumed as **built `dist`** (only `@brightloop/ui` is transpiled by Next) → a production build **must** run `turbo build` so the dist packages compile first.
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime). Project ref `idfnosmfedwehkebwspe`.
- **Deploy:** Vercel. Root Directory `application/apps/web`; build command (in `apps/web/vercel.json`) `cd ../.. && pnpm turbo run build --filter=@brightloop/web`. Live at `https://bright-loop-platform.vercel.app`.

---

## 3. Route inventory

From the production build (`○` static · `●` SSG w/ generateStaticParams · `ƒ` dynamic/SSR). Full
per-route detail with server actions is in the workflow section below and in the companion docs.

### Public — `(public)` group (marketing + funnel)
`/` (SSG, revalidate 300) · `/services` · `/services/[discipline]` (SSG ×4: brand/build/automate/grow) ·
`/packages` · `/portfolio` (SSR, searchParams) · `/portfolio/[slug]` (SSG) · `/case-studies/[slug]` (SSG → canonical /portfolio) ·
`/testimonials` (SSR) · `/contact` · `/legal/[document]` (privacy/terms/cookies, noindex) · `/start` (Turnstile-gated signup) ·
`/assessment` · `/configurator` · `/recommendation` · `/roadmap` (funnel steps → `FunnelWizard`)

### Auth — `(auth)` group + session handlers
`/login` (SSR) · `/forgot-password` · `/reset-password` · `/auth/callback` (GET, magic-link/OAuth code → session) ·
`/auth/reset` (GET, password-recovery PKCE exchange)

### Client portal — `portal` (host `app.brightloop.co`, all `force-dynamic`)
`/portal` (dashboard) · `/portal/chat` · `/portal/project` · `/portal/deliverables` · `/portal/deliverables/[id]` ·
`/portal/invoices` · `/portal/proposals` · `/portal/contracts` · `/portal/notifications`

### Admin — `admin` (host `admin.brightloop.co`, all `force-dynamic`)
`/admin` · `/admin/leads` · `/admin/clients` · `/admin/clients/[id]` · `/admin/projects` · `/admin/projects/[id]` ·
`/admin/conversations` · `/admin/conversations/[id]` · `/admin/proposals` · `/admin/proposals/[id]` · `/admin/contracts` ·
`/admin/invoices` · `/admin/portfolio` · `/admin/portfolio/new` · `/admin/portfolio/[id]` · `/admin/reviews` ·
`/admin/analytics` · `/admin/automation`

### API routes — `app/api/**` (all POST unless noted)
`/api/attachments/[id]` (GET — RLS-scoped 60s signed URL) · `/api/webhooks/n8n` · `/api/webhooks/payments` · `/api/webhooks/signatures`

### Meta
`/robots.txt` (allow `/`, disallow portal/admin/login/legal) · `/sitemap.xml` (published portfolio slugs + static, revalidate 300)

---

## 4. Middleware (authorization check 1 of 3)

`apps/web/src/middleware.ts` — defence-in-depth layer 1. On every matched request:
1. `updateSession(request)` refreshes the Supabase cookie session and returns **verified JWT claims** (`getClaims()`, ES256 checked against JWKS — not `getUser()`).
2. Resolves the surface: `hostSurface` (subdomain) wins if protected, else `pathSurface` (so localhost works without subdomains).
3. Public surface → pass through (no gate).
4. Protected surface → gate on `roleFromClaims(claims.app_metadata)` + `roleAllowedOn(surface, role)`; unauthorized → `redirect /login?next=<prefix>`.
5. Subdomain host + root-relative path → **rewrite** into the route-group prefix (`/portal/*`, `/admin/*`).

Matcher: `"/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)"` — auth routes are intentionally matched so the session cookie stays fresh.

Layers 2 and 3: layout guards (`requireSurface` in `portal/layout.tsx`, `admin/layout.tsx`) re-assert role; **RLS** is the final authority in the database.

---

## 5. Database — migrations & RLS

- **Migrations:** `application/supabase/migrations/` — **22 files**, `20260716000100_enums.sql` → `20260716090000_rls_audit_helper.sql`, plus `seed.sql`. This is the schema source of truth. Migrations are **current** (the deployed schema is built from exactly these files; the working tree is clean).
- **Generated types:** `@brightloop/db` exports the TS `Database` type (source of truth for row shapes).

### RLS — enabled and verifiable
- **34 tables** have `ENABLE ROW LEVEL SECURITY`; **89 policies** defined across the migrations.
- Tables (all under `public`): `analytics_events, assessments, automations, chat_messages, clients, configurations, consents, contracts, conversation_assignments, conversation_participants, conversations, deliverables, file_uploads, internal_notes, invoices, leads, meetings, message_attachments, message_reads, messages, milestones, notifications, payments, portfolio_projects, pricing_estimates, projects, proposals, quote_items, quote_revisions, quotes, state_transitions, testimonials, transition_log, users`.
- **Verification mechanism:** migration `20260716090000_rls_audit_helper.sql` defines `public.bl_rls_audit()` — a `SECURITY DEFINER` function (service-role only) returning `(table_name, rls_enabled, policy_count)` per public table, so ops can prove no table ships with RLS off or unpolicied.

### Authorization model (verified)
- **Role source of truth = the JWT**, not the user record. `custom_access_token_hook` (migration `..._auth_claims.sql`) stamps `app_metadata.role` and `app_metadata.client_id` into the access token from `public.users`. **A user with no role gets no role claim → RLS denies everything** (fail-closed; no fallback role). Only `supabase_auth_admin` may execute the hook.
- **Admin authorization:** internal roles (`owner`, `admin`, `team_member`) hold broad namespaced capabilities (`PERMISSIONS` matrix in `packages/schema/src/roles.ts`); enforced by `assertCapability` in the service layer + RLS policies keyed on role.
- **Client authorization:** client roles (`client_admin`, `client_member`) hold only `own.*` capabilities and are **row-scoped by RLS** to `auth.client_id`. Clients never write status rows directly — only via `SECURITY DEFINER` RPCs (`bl_client_proposal_action`, `bl_client_contract_sign`, `bl_client_quote_action`, `bl_activate_client`).
- **State machines:** every status change flows through `performTransition` (capability guard → `can()` machine guard → audit row *before* update → DB `BEFORE UPDATE` trigger backstop → analytics event). Even the RLS-bypassing service-role client cannot drive an illegal transition — the machine guard and DB trigger still fire.

---

## 6. Environment variables

Full table with files/purpose/required in **BACKEND-INTEGRATION-INVENTORY.md §7**. Summary of the freeze state:

- **Every env var referenced in application source is documented in `application/.env.example`.** No undocumented runtime vars.
- **Required at runtime:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (server flows).
- **Optional / behind-env (mock until set):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `N8N_WEBHOOK_SECRET`, `ESIGN_API_KEY`, `ESIGN_WEBHOOK_SECRET`, `EMAIL_PROVIDER_API_KEY`, `NEXT_PUBLIC_SITE_URL`, host vars, `BRIGHTLOOP_DATA_SOURCE`.
- **Documented but not yet wired in code (reserved):** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `N8N_WEBHOOK_BASE_URL`. CLI-only: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`.

---

## 7. Integration points (summary)

Detailed in **BACKEND-INTEGRATION-INVENTORY.md**. All third-party integrations are **provider-behind-env** — the pipelines are real; concrete vendors resolve to deterministic mocks until credentials are set.

- **Supabase clients (5):** server (RLS), browser (RLS), middleware (session refresh), service-role (bypasses RLS — webhooks/signup only), anon (build-time public content).
- **Webhooks (3, POST):** `/api/webhooks/n8n`, `/api/webhooks/payments`, `/api/webhooks/signatures` — each verifies an **HMAC-SHA256 signature over the raw body first (401 on failure)**, then guards the state move, then writes via service-role. `verifyHmacSignature` in `apps/web/src/lib/webhook-signature.ts`.
- **n8n:** inbound signed status callback → `automations` table + `automation` machine; monitoring UI at `/admin/automation`. Outbound trigger is defined as a port (`AutomationProvider`) but not yet implemented (mock only).
- **Turnstile:** server verify in `apps/web/src/lib/turnstile.ts` (siteverify); gates `/start` signup only; enforced when `TURNSTILE_SECRET_KEY` is set; fails closed on network error.
- **Email:** consent-gated pipeline (`apps/web/src/lib/email.ts`); marketing sends require a granted `consents` row; provider mock until `EMAIL_PROVIDER_API_KEY`.
- **Payments / e-sign:** pluggable adapters; mock settles in-app; real Stripe/e-sign behind env.

---

## 8. Frozen-state confirmations (task checklist)

| Item | Status | Evidence |
|---|---|---|
| lint / typecheck / tests / build | ✅ PASS | §1 — 24/24 tasks, 226 tests, 31 pages |
| Supabase migrations current | ✅ | §5 — 22 migrations, clean tree, deploy built from them |
| All env vars documented | ✅ | §6 — every code var in `.env.example`; gaps are reserved/CLI-only |
| Authentication works | ✅ (logic + tests + prod) | PKCE flow, `(auth)/actions.ts`, `surfaces.test.ts` |
| Admin authorization works | ✅ | JWT role hook + `assertCapability` + RLS; `capabilities.test.ts`, `guard.test.ts` |
| Client authorization works | ✅ | `own.*` caps + RLS `client_id` scoping + RPC-only writes |
| RLS enabled and verified | ✅ | §5 — 34 tables / 89 policies + `bl_rls_audit()` |
| Webhook endpoints documented | ✅ | §7 + BACKEND doc §3 |
| n8n integration documented | ✅ | §7 + BACKEND doc §4 |
| Turnstile documented | ✅ | §7 + BACKEND doc §5 |
| Routes/workflows inventoried | ✅ | §3–§4 + BACKEND/REUSABLE docs |
