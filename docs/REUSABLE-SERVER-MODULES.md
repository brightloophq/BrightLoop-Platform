# Reusable Server & Logic Modules (Frozen Reference)

> Companion to **BRIGHTLOOP-FROZEN-BASELINE.md**. The exact modules that are **safe to reuse** in
> the Auxion frontend rebuild, with per-module coupling notes. Root: `application/`.
>
> **Principle:** the backend/logic layer (`packages/{schema,domain,data,db}` + most of
> `apps/web/src/lib`) is framework-agnostic and stays. Presentation (`packages/ui`, `*.module.css`,
> tokens, page/layout JSX, navigation config) is rebuilt — see **AUXION-MIGRATION-SOURCE-MAP.md**.

Layered integrity model, top to bottom: **UI (hide/disable) → service layer (`assert*`) → DB (RLS + triggers)**. A new frontend plugs into the top and inherits the lower two unchanged.

---

## 1. `packages/schema` — CONTRACTS ✅ REUSABLE (framework-agnostic)

Zod schemas, TS types, state machines, role matrix. Only import is `zod`. Barrel: `src/index.ts`.

| File | Exports (selected) |
|---|---|
| `src/roles.ts` | `ROLES`, `PERMISSIONS`, `ROLE_NAMES`, `Role`; `isRole`, `isInternalRole`, `isClientRole`, `hasCapability` (`*`, `ns.*` wildcards). **5 roles:** owner/admin/team_member (internal), client_admin/client_member (client) |
| `src/machines.ts` | `MACHINES` (**16 machines**), `MachineName`, `MachineState`; `can`, `nextStates`, `isTerminal`, `statesOf`, `isValidState`, `MACHINE_NAMES` |
| `src/entities.ts` | `ENTITIES`, primitives (`idSchema`/`timestampSchema`/`moneySchema`), `statusEnum()`, 18 entity Zod schemas + inferred types, `lineItemSchema`, `ENTITY_SCHEMAS`. Money = integer cents; timestamps ISO-8601 |
| `src/reputation.ts` | `PUBLISH`/`PUBLISH_RANK`/`isPublicPublish`, `FACETS`, `DISCIPLINES`, `METRIC_DEFS`, `RATING_CATEGORIES`; `portfolioProjectSchema`, `testimonialSchema`, `metricsSchema`; types. Encodes the publish gate + metric-disclosure rules |
| `src/catalog.ts` | `serviceModuleSchema`, `planSchema`, `estimateRangeSchema`, `DISCIPLINE_ORDER`, `DISCIPLINE_SLUGS`, `disciplineFromSlug`, `slugForDiscipline`; types. Estimate = range, never a quote |
| `src/tone.ts` | `Tone`, `STATUS_TONE`, `toneFor(status)` — status→tone map ⚠ *values couple to the UI Badge palette* |
| `src/index.ts` | Barrel |

**Coupling:** none framework-level. `tone.ts` maps to design-system tone names — logic reusable, palette may be re-decided in Auxion.

---

## 2. `packages/domain` — SERVICE LAYER / PURE LOGIC ✅ REUSABLE

Layer 2 of the integrity model. Pure TS; only imports `@brightloop/schema`. No Next/React/DB driver. Barrel: `src/index.ts`.

| File | Purpose |
|---|---|
| `src/errors.ts` | `TransitionError`(409), `AuthorizationError`(403), `ClientScopeError`(403) carrying `httpStatus` |
| `src/guard.ts` | `assertTransition`, `transition`, `allowedTransitions`, `systemClock`, `TransitionRecord` — transition guard + audit-row builder |
| `src/capabilities.ts` | `Actor`, `assertCapability`, `assertOwnClient`, `assertCanActOnClient`, `may` |
| `src/events.ts` | `DomainEvent`, `EventSink`, `InMemoryEventSink`, `NoopEventSink` |
| `src/adapters/{payment,signature,email,automation}.ts` | Provider **ports** + deterministic mocks (Stripe, e-sign, email, n8n) |
| `src/reputation/query.ts` | `publicProjects`, `publicTestimonials`, `featuredProjects`, `projectBySlug`, `disclosedMetrics`, `query`, `sortProjects`, `paginate`, `aggregate`, … — publish gate + metric-disclosure gate + filter/search/sort/paginate |
| `src/reputation/seo.ts` | `SITE_ORIGIN`, `canonicalUrl`, `schemaFor`, `aggregateSchema` — canonical URLs + JSON-LD, fail-closed. ⚠ see coupling |
| `src/reputation/facets.ts` | `facetCounts`, `activeFilterChips`, `FACET_LABELS`, `FACET_ORDER` |
| `src/catalog/pricing.ts` | `rangeFor`, `sumRanges`, `formatMoney`, `formatRange`, `ESTIMATE_DISCLAIMER` — estimate-range math (never a quote) |
| `src/funnel/assessment.ts` | `scoreDimensions`, `healthScore`, `healthBand`, `isAssessmentComplete` |
| `src/funnel/configurator.ts` | `resolveConfiguration` (price-free client path), **`computeInternalEstimate`** (server-only pricing), `recommendPlan` |
| `src/quotes/quote.ts` | `quoteTotals`, `lineAmount`, `CLIENT_HIDDEN_QUOTE_STATES`, `isQuoteVisibleToClient` — draft-quote gate mirrored by RLS |
| `src/analytics/events.ts` | `ANALYTICS_EVENTS`, `AnalyticsEventName`, `eventForTransition` |
| `src/analytics/funnel.ts` | `acquisitionFunnel`, `countByName`, `formatRate` |
| `src/repositories/{reputation,catalog}.ts` | `ReputationRepository` / `CatalogRepository` **ports**, `DataSource` |

**Coupling:** `reputation/seo.ts` hardcodes `SITE_ORIGIN = "https://brightloop.co"` (default; overridable via `origin` param) and `creator.name/name: "Auxion"` in JSON-LD (not overridable). Update for the rebuild's canonical domain/org name. Everything else fully portable.

---

## 3. `packages/data` — REPOSITORIES & MAPPERS ✅ REUSABLE (server data access)

The **only seam between the app and persistence.** Imports `@brightloop/{domain,schema,db}` + `@supabase/supabase-js`. No Next/React. Barrel: `src/index.ts`.

| File | Exports |
|---|---|
| `src/index.ts` | `createReputationRepository(config)`, `createCatalogRepository()`, `isPlaceholderData()`; re-exports repos, type **`AuxionSupabaseClient`**, mappers, `PLACEHOLDER_*` datasets |
| `src/supabase/reputation.repository.ts` | `SupabaseReputationRepository`, type **`AuxionSupabaseClient = SupabaseClient<Database>`** |
| `src/supabase/mappers.ts` | `toPortfolioProject`, `toTestimonial` (snake_case DB → camelCase domain; `disclosed` defaults false) |
| `src/placeholder/reputation.repository.ts` | `PlaceholderReputationRepository` (dev/test fallback over same port) |
| `src/placeholder/catalog.repository.ts` | `PlaceholderCatalogRepository` (always bound for catalog) |
| `src/placeholder/{reputation,catalog}.dataset.ts` | `PLACEHOLDER_*` sample data — **dev seed only, not real content** |

**Per-request binding pattern (MUST carry over):** `createReputationRepository({ source: "supabase", client })` requires a **request-scoped** `AuxionSupabaseClient` and throws if absent — never cache it in a module-level singleton (a shared client leaks one user's session/RLS view to another). The catalog repo is always the static placeholder (no catalog tables exist).

> **Naming correction:** the type is **`AuxionSupabaseClient`** (`src/supabase/reputation.repository.ts:61`, re-exported from `src/index.ts`), not `BrightLoopSupabaseClient` — it was renamed during the Auxion sweep. It aliases `SupabaseClient<Database>`.

---

## 4. `packages/db` — MIGRATIONS + GENERATED TYPES ✅ REUSABLE (schema source of truth)

- **Migrations:** `application/supabase/migrations/` — **22 `.sql`** files (+ `seed.sql`). *Physically under `application/supabase/`, not inside `packages/db`.*
- **Generated types:** `packages/db/generated/database.types.ts` (34 table Row types). GENERATED — regenerate via `pnpm --filter @brightloop/db gen:types`. Barrel `packages/db/index.ts` exports `Database`, `Json`, `Tables`, `TablesInsert`, `TablesUpdate`, `Enums`.
- DB is integrity layer 3: the `transition_guard` trigger + RLS policies enforce the same machine/publish/scope rules the domain asserts.

Key migrations by concern: `..._transition_guard.sql` (machine trigger), `..._rls.sql` + `..._client_approval_rls.sql` + `..._conversation_client_writes.sql` (RLS), `..._auth_claims.sql` (JWT role hook), `..._reputation.sql` (publish gate), `..._quotes.sql` (draft-quote gate), `..._sales_activation.sql` (`bl_activate_client` RPC), `..._internal_pricing.sql` (internal-only pricing), `..._rls_audit_helper.sql` (`bl_rls_audit()`).

---

## 5. `apps/web/src/lib` — SERVER HELPERS

### ✅ REUSABLE — pure utilities (no framework binding)
- `lib/slug.ts` — `slugify`, `isValidSlug`, `SLUG_RE` (matches DB kebab CHECK).
- `lib/portfolio-params.ts` — URL-state ↔ query logic (`parsePortfolioParams`, `buildPortfolioQuery`, `portfolioHref`, `toggleFacetValue`, …). Imports schema/domain types only.
- `lib/webhook-signature.ts` — `verifyHmacSignature`, `signHmac` (Node `crypto` HMAC-SHA256).
- `lib/revalidate.ts` — `PUBLIC_REVALIDATE_SECONDS` (300).

### ✅ REUSABLE — server helpers, pluggable-provider (Node, not Next)
- `lib/payments.ts` — `selectPaymentProvider`, `isPaymentsConfigured`, `paymentWebhookSecret`.
- `lib/signatures.ts` — `selectSignatureProvider`, `isSignaturesConfigured`, `signatureWebhookSecret`.
- `lib/turnstile.ts` — `isTurnstileEnforced`, `verifyTurnstile` (fetch → Cloudflare siteverify).

### ✅ REUSABLE (logic) — but Supabase/Next-request-coupled (re-wire the bindings)
- `lib/surfaces.ts` — surface/claim parsing (pure logic over schema roles + `env` hosts).
- `lib/auth.ts` — `getActor`, `requireSurface`. *Uses `next/navigation` redirect + `getClaims()`* — Actor logic reusable, redirect is Next-specific.
- `lib/supabase/server.ts` — request-scoped RLS client. *Uses `next/headers` cookies().*
- `lib/supabase/middleware.ts` — `updateSession`. *Uses `next/server`.*
- `lib/supabase/anon.ts` — cookie-less anon client (portable plain supabase-js).
- `lib/supabase/service.ts` — service-role client, **bypasses RLS** (webhook/signup only; portable).
- `lib/repositories.ts` — binds source via `BRIGHTLOOP_DATA_SOURCE`; `getReputationRepository`/`getAuthedReputationRepository`.
- `lib/analytics.ts` — `emitEvent` (server emitter, never throws).
- `lib/email.ts` — `dispatchEmail` (consent-gated pipeline).
- `lib/settle.ts` — `settlePaymentSucceeded` (service-role + `can()` guard + `bl_activate_client`). Core settlement logic.
- `lib/env.ts` / `lib/site-url.ts` — env + redirect-URL resolution (hardcoded host/URL fallbacks — re-point for the new deployment).

### ⛔ FRONTEND-COUPLED (do not reuse)
- `lib/navigation.ts` — imports `@brightloop/ui` types + placeholder marketing copy; nav config for the *current* UI. Rebuild for Auxion.
- `lib/supabase/client.ts` — `"use client"` browser client; tiny/regenerable.

---

## 6. Boundary cases — server logic under `app/` (reusable *logic*, Next-specific *shell*)

Not presentation; review rather than discard. Logic is portable, the Next route/action shell is not:
- `app/api/webhooks/{n8n,payments,signatures}/route.ts` — verified-webhook handlers.
- `app/api/attachments/[id]/route.ts` — signed-attachment access.
- `app/auth/{callback,reset}/route.ts` — PKCE/recovery exchange.
- `app/(auth)/actions.ts`, `app/(public)/start/actions.ts`, and all other `"use server"` action files — wrap domain guards/validation (see workflow map in BRIGHTLOOP-FROZEN-BASELINE / the source map).
- `app/admin/transition-service.ts` — `performTransition`, the single guarded-transition seam (capability + `can()` + audit + trigger + analytics). **Reuse this pattern verbatim.**
- `middleware.ts` — session refresh + surface routing.

---

## 7. Reuse checklist (coupling to resolve)

1. Keep `@brightloop/*` package names, `--bl-*` var prefix, `brightloop.co` hosts — intentional, not rename targets.
2. `domain/reputation/seo.ts` — override `SITE_ORIGIN` default; the `"Auxion"` org name in JSON-LD is a literal to update if the canonical domain/name changes.
3. `data` repositories — always inject a **request-scoped** `AuxionSupabaseClient`; never cache. Regenerate `@brightloop/db` types after any migration.
4. Treat `application/supabase/migrations` as the schema source of truth; generated types are downstream.
5. Next-coupled lib files (`auth.ts`, `supabase/server.ts`, `supabase/middleware.ts`): reuse the logic, re-implement the `next/*` request-API glue if the frontend framework changes. If Auxion stays on Next.js App Router, these carry over as-is.
6. `server-only` markers are Next build guards — keep on Next, drop when porting to a non-Next server.
7. `env.ts`/`site-url.ts` carry hardcoded fallbacks (`brightloop.co`, `bright-loop-platform.vercel.app`, `localhost:3000`) — re-point per deployment.
8. `lib/navigation.ts` is the one lib file that is genuinely frontend — rebuild, don't port.
