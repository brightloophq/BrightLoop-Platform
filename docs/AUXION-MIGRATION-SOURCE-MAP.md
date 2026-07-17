# Auxion Migration Source Map

> The decision map for building the **Auxion** frontend against the frozen BrightLoop backend.
> Reads on top of **BRIGHTLOOP-FROZEN-BASELINE.md**, **BACKEND-INTEGRATION-INVENTORY.md**, and
> **REUSABLE-SERVER-MODULES.md**. Root: `application/`. Freeze tag: `brightloop-frozen-v1`.

---

## 1. Reuse vs rebuild — at a glance

| Layer | Path | Decision | Why |
|---|---|---|---|
| Contracts | `packages/schema/**` | ✅ **REUSE verbatim** | Zod/types/state machines/role matrix; zero framework coupling |
| Domain logic | `packages/domain/**` | ✅ **REUSE verbatim** | Pure service layer (guards, capabilities, reputation/funnel/quote/pricing/analytics). One literal to update in `reputation/seo.ts` |
| Data access | `packages/data/**` | ✅ **REUSE verbatim** | Repository ports + Supabase/placeholder impls + mappers; inject request-scoped client |
| Database | `packages/db/**` + `supabase/migrations/**` | ✅ **REUSE verbatim** | Schema source of truth: 22 migrations, 34 RLS tables/89 policies, triggers, RPCs, generated types |
| Server helpers | `apps/web/src/lib/**` (except below) | ✅ **REUSE** (re-wire Next glue) | Supabase clients, auth/actor, repositories binding, settle, email, analytics, turnstile, payments, signatures, webhook-signature, slug, portfolio-params |
| Server actions & routes | `app/**/*actions.ts`, `app/api/**/route.ts`, `app/auth/**/route.ts`, `app/admin/transition-service.ts`, `middleware.ts` | ✅ **REUSE the logic** | Business logic portable; the Next route/action shell stays if Auxion is Next.js App Router |
| **Design system** | `packages/ui/**` | ⛔ **REBUILD** | All components + `*.module.css` + Logo/Navbar/Footer/CTASection |
| **Design tokens** | `packages/ui/src/tokens/*.css` | ⛔ **REBUILD** | `--bl-*` CSS var system |
| **Page/layout composition** | `apps/web/src/app/**/*.tsx` (pages, layouts, client components, forms-as-JSX) | ⛔ **REBUILD** | 83 `.tsx` presentation files |
| **Page CSS** | `apps/web/src/app/**/*.module.css` | ⛔ **REBUILD** | 14 CSS Module files |
| **Navigation config** | `apps/web/src/lib/navigation.ts` | ⛔ **REBUILD** | Imports UI types + placeholder copy |
| **Browser Supabase client** | `apps/web/src/lib/supabase/client.ts` | ⛔ **REGENERATE** | 3-line `"use client"` factory |

### ✅ Safe to reuse (task item 4)
Supabase clients (`lib/supabase/{server,middleware,service,anon}.ts`) · auth helpers (`lib/auth.ts`, `lib/surfaces.ts`) · server repositories (`packages/data/**`, `lib/repositories.ts`) · schemas & types (`packages/schema/**`, `packages/db` generated types) · guards (`packages/domain/{guard,capabilities}.ts`, `app/admin/transition-service.ts`) · webhook verification (`lib/webhook-signature.ts`, `app/api/webhooks/**`) · domain services (`packages/domain/**`) · utilities (`lib/{slug,portfolio-params,settle,email,analytics,turnstile,payments,signatures,site-url,env}.ts`).

### ⛔ Must NOT reuse (task item 5)
UI components (`packages/ui/src/components/**`) · layouts (`app/**/layout.tsx`) · page composition (`app/**/page.tsx` + client components) · CSS (all `*.module.css`) · design tokens (`packages/ui/src/tokens/*.css`) · navigation (`lib/navigation.ts`) · branding (`packages/ui/src/components/Logo.tsx` + marks) · old dashboard presentation (`app/admin/**/*.tsx`, `app/portal/**/*.tsx`).

> The current repo already contains a *partial* Auxion reskin (P0 tokens/logo/name + P1 light-surface flip). Under this freeze that reskinned UI is still **rebuild** material — the frozen value is the backend/logic beneath it, not the presentation.

---

## 2. Backend connection requirements (what the new frontend must wire)

To talk to the frozen backend, the Auxion frontend must:

1. **Supabase session (SSR + PKCE).** Use the four server clients as-is:
   - Request-scoped RLS client (`lib/supabase/server.ts`) for all authenticated reads/writes.
   - Middleware session refresh (`lib/supabase/middleware.ts`) on every request; read role from **`getClaims()`** (verified JWT), never `getUser()`.
   - Service-role client (`lib/supabase/service.ts`) **only** behind a verified webhook or the signup action.
   - Anon client (`lib/supabase/anon.ts`) for build-time/public content.
2. **Role from the JWT.** `app_metadata.role` + `client_id` are stamped by the DB `custom_access_token_hook`. The frontend must read them via the claim parsers (`roleFromClaims`, `clientIdFromClaims`) — it must not derive role from the user row.
3. **Three-layer authorization, unchanged.** Keep middleware gate (surface × role) → layout guard (`requireSurface`) → RLS. UI hide/disable is UX only, never security.
4. **Surface routing.** Host→surface mapping (`app.` = portal, `admin.` = admin) or path prefixes on localhost. Preserve the middleware rewrite or reproduce it.
5. **Guarded transitions.** Every status change goes through `performTransition` (`app/admin/transition-service.ts`) or the client RPCs (`bl_client_*`). The frontend never writes status columns directly.
6. **Repository seam.** Get data through `createReputationRepository({ source, client })` with a **request-scoped** client; never cache the client.
7. **Webhooks (server-to-server, not frontend).** Keep the three `/api/webhooks/*` routes with HMAC-SHA256 raw-body verification; they are invoked by n8n/Stripe/e-sign, not the browser.
8. **Security headers / CSP.** Keep `next.config.mjs` CSP/HSTS (or equivalent): only Supabase (REST+WSS) + Cloudflare Turnstile are cross-origin. **Self-host fonts** (`next/font`) — Google Fonts `@import`/CDN is CSP-blocked.
9. **Env.** Provide the required vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) + optional provider vars; re-point host/URL fallbacks in `env.ts`/`site-url.ts`. See BACKEND doc §7.
10. **Realtime.** Conversations/attachments use Supabase Realtime (migration `..._goal_and_attachments_realtime.sql`); the chat UI must resubscribe via the browser client.

### Entry points the frontend calls
- **Server actions** (`"use server"`): `(auth)/actions.ts`, `(public)/start/actions.ts`, `portal/portal-actions.ts`, `portal-sales-actions.ts`, `quote-actions.ts`, `conversation-actions.ts`, `sales-actions.ts`, `admin/delivery-actions.ts`, `admin/reputation-actions.ts`. Full action list in BRIGHTLOOP-FROZEN-BASELINE §workflow / routes agent output.
- **Client RPCs** (SECURITY DEFINER, client-safe): `bl_client_proposal_action`, `bl_client_contract_sign`, `bl_client_quote_action`, `bl_activate_client`.
- **Repositories:** `getReputationRepository` / `getAuthedReputationRepository` / `getCatalogRepository`.

---

## 3. Risks for the new Auxion frontend

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **Bypassing the authorization layers.** Treating UI hide/disable as security, or writing status columns directly instead of via `performTransition`/RPCs. | Broken integrity, RLS/transition errors, or a security hole. | Route every mutation through the service actions/RPCs; keep middleware + layout guards + RLS. |
| R2 | **Caching the Supabase client across requests.** A module-level singleton leaks one user's session/RLS view to another. | Cross-tenant data exposure. | Always inject a **request-scoped** client into `createReputationRepository`; the factory throws if missing — don't defeat that. |
| R3 | **Reading role from `getUser()` instead of `getClaims()`.** GoTrue `app_metadata` only holds provider info; the role lives in the signed JWT. | Auth appears to work but role is always null → everything denied, or a wrong role is trusted. | Use `getClaims()` + the claim parsers, as the frozen code does. |
| R4 | **CSP regressions.** Adding CDN scripts, Google Fonts `@import`, or external assets. | Blank fonts, blocked scripts, broken Turnstile. | Keep the CSP allow-list; self-host fonts via `next/font`; only Supabase + Turnstile are external. |
| R5 | **Monorepo build order.** `@brightloop/{schema,domain,data,db}` are consumed as built `dist`; a bare `next build` fails to resolve them. | Deploy build fails (this exact failure happened pre-freeze). | Build via `turbo run build --filter=@brightloop/web` (already set in `apps/web/vercel.json`). |
| R6 | **Losing the guarded-transition seam.** Reimplementing status changes in the new UI without `can()`/audit. | Illegal state moves, missing audit trail, broken analytics. | Reuse `performTransition` verbatim; it is the single seam. |
| R7 | **Hardcoded brand/host literals.** `seo.ts` `SITE_ORIGIN`/org name, `env.ts`/`site-url.ts` fallbacks (`brightloop.co`, `bright-loop-platform.vercel.app`). | Wrong canonical URLs / redirect base / JSON-LD org. | Override the origin, re-point host fallbacks, update the JSON-LD org name when the canonical domain is decided. |
| R8 | **Realtime not resubscribed.** New chat UI forgets to subscribe via the browser client. | Messages don't live-update. | Wire the Realtime subscription in the rebuilt chat components. |
| R9 | **Placeholder content mistaken for real.** `PLACEHOLDER_*` datasets + the "Preview — sample content" banner + empty legal shells. | Shipping sample testimonials/prices as real. | Keep the honest-placeholder labeling; real testimonials/legal/pricing are pending (Reputation CMS / legal / open pricing decisions). |
| R10 | **Provider mocks in production.** Payments/e-sign/email/n8n resolve to mocks until their secrets are set. | "Successful" flows that didn't really charge/send/sign. | Set the provider secrets (BACKEND §7) before relying on any real transaction; the routes 503 without webhook secrets. |
| R11 | **Regenerated types drift.** Editing `packages/db/generated/database.types.ts` by hand, or changing migrations without regenerating. | Type/reality mismatch. | Treat migrations as source of truth; `pnpm --filter @brightloop/db gen:types` after changes. |
| R12 | **Accessibility/SEO regressions.** The frozen app passed an AA audit + ships SEO (sitemap, JSON-LD, canonicals, robots). A fresh UI can lose these. | Compliance + search regressions. | Re-apply the AA patterns and keep the SEO helpers (`domain/reputation/seo.ts`, `app/{sitemap,robots}.ts`). |

---

## 4. Suggested migration order (frontend rebuild)

1. **Stand up the shell** against the frozen backend: Next App Router app that imports `@brightloop/{schema,domain,data,db}` and reuses `lib/**` server helpers + `middleware.ts`. Prove auth + one RLS-scoped read work end-to-end.
2. **Rebuild the design system** (`packages/ui` equivalent) with the Auxion Living Blueprint tokens/components — no logic.
3. **Rebuild pages surface by surface**, wiring each to the existing server actions/repositories: public → funnel → auth → portal → admin. Keep SEO + a11y + CSP.
4. **Swap provider mocks for real vendors** by setting secrets; verify webhooks with signed test payloads.

---

## 5. Freeze coordinates

- **Tag:** `brightloop-frozen-v1`
- **Branch:** `main`
- **Quality gate:** lint ✅ · typecheck ✅ · tests ✅ 226 · build ✅ 31 pages (BRIGHTLOOP-FROZEN-BASELINE §1)
- **DB:** 22 migrations · 34 RLS tables / 89 policies · `bl_rls_audit()` verifier
- **Commit hash:** recorded in the tag / the docs commit (see repo `git show brightloop-frozen-v1`).
