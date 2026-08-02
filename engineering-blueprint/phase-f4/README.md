# AUXION — Phase F · Sprint F4.1 · Integration Platform Foundation

> Engineering report. This sprint ships the **framework every external service
> plugs into** — the Connector Platform. It is **not** a Gmail sprint, not a Slack
> sprint, not a Shopify sprint. No vendor integration is implemented. The only
> live connectors are two deterministic **Fake** connectors that exercise the whole
> framework offline.

Branch: `feat/f4-integration-core` (off `main`) · one PR, left **open** (do not merge).

---

## 1. Mission

Build the Integration Platform that every future connector (Gmail, Slack, Shopify,
Stripe, HubSpot, QuickBooks, Meta, LinkedIn, …) will use — **without building any of
them**. The deliverable is the governed seam: a connector registry, per-tenant
installations, lifecycle, a capability model, health, configuration, secret
references, an OAuth abstraction, a provider-adapter port, webhook + polling
abstractions, event translation, and the marketplace / installed / details UI.

Everything is **deterministic, capability-driven, authorization-aware,
tenant-isolated, replay-safe, idempotent, audited, and fully tested** — the same
engineering bar as Phases D, E and F3.

## 2. First principle — extend, never duplicate

F4 is a new `integration` bounded context that **extends** the systems D/E/F built,
consuming their contracts rather than restating them:

| Existing system | How F4 reuses it |
|---|---|
| **F3 provider-adapter port** (`RuntimeAdapter`) | Generalized into `ConnectorAdapter` — the same provider-neutral, opaque-id, normalized-error shape, extended with OAuth / webhook / polling / event-translation. |
| **F3 secret-store port** (`RuntimeSecretStore`) | Mirrored as `ConnectorSecretStore` — reference-only, values never touch a DTO/row/log. |
| **B/13B result model** (`RuntimeResult` + `mapDatabaseError`) | Every connector repository returns `RuntimeResult<T>`; no raw DB error crosses the port. |
| **B idempotency** (`idempotency_key`, replay/conflict) | Every ingestion write carries a structural idempotency key; replay returns the existing row. |
| **Authorization matrix** (`roles.ts` `PERMISSIONS`, `may`/`assertCapability`) | A new `integration.*` capability namespace; the C1 `authorize(actor, cap, clientId)` funnel. |
| **RLS + tenancy helpers** (`bl_is_internal`, `bl_client_id`) | Internal-writes / client-reads-own; secret + OAuth tables internal-only — the F3 pattern verbatim. |
| **Append-only audit** (`bl_txexec_append_only`) | Health, events, receipts, cursors, audit are append-only via the shared Phase-D trigger. |
| **Application boundary** (`AppContext`, use-cases, DTOs, `ApplicationError`) | Connector use-cases follow the C1 shape exactly; the route/action layer is unchanged. |
| **Workspace product UI** (F1/F3.5 dark-first) | Marketplace / installed / details live under `/workspace/integrations`, reusing the design system + `pages.module.css`. |

Nothing in Phase C/D/E/F1–F3 was modified except **additive** wiring: three new
`AppContext` fields + accessors, three repository getters, one nav item, one
`Plug` icon, and the `integration.*` capability grants.

## 3. What shipped

### Domain concepts (all requested items)

- **Connector Registry** — `CONNECTOR_REGISTRY`, a pure additive catalogue (mirrors
  the AI-Foundation `MODEL_REGISTRY`): stable ids, an `available` toggle, indexed by
  a private map. Ships `fake-connector` (api_key + webhook + polling) and
  `fake-oauth` (oauth2 + polling) as **available**, plus three vendor-neutral
  **example** descriptors (`example-oauth`, `example-webhook`, `example-polling`)
  marked unavailable — no adapter, not installable.
- **Connector Domain / Capability Model** — `ConnectorDescriptor`,
  `ConnectorCapabilityDescriptor` (read/write/external side-effects),
  `ConfigFieldDescriptor` (typed, `secret`-flagged fields).
- **Connector Installation** — the tenant-scoped versioned root (`connector_installation`).
- **Connector Lifecycle** — a guarded machine `pending_configuration → configuring →
  validating → connected → degraded → disabled → error → revoked` (revoked terminal),
  plus an OAuth-grant machine `pending → authorized → exchanged`.
- **Connector Health** — append-only `ConnectorHealthSnapshot`; health→status
  derivation is pure.
- **Connector Configuration** — `validateConnectorConfig` validates against the
  descriptor and **splits secret fields out of persisted config**.
- **Secret References** — `ConnectorSecretReference` (internal-only) — an opaque
  `secretRef` + version + validation posture, resolved through `ConnectorSecretStore`.
- **OAuth Abstraction** — pure state/scope/expiry helpers in the domain; URL build +
  code exchange + refresh behind the adapter; tokens stored by reference only.
- **Provider Adapter Port** — `ConnectorAdapter` + `ConnectorAdapterRegistry`.
- **Webhook Abstraction** — signature verify → translate → persist; idempotent
  receipts (`connector_webhook_receipt`).
- **Polling Abstraction** — cursor-based, replay-safe (`connector_polling_cursor`).
- **Event Translation** — `normalizeTranslatedEvents` validates, sanitizes, dedupes,
  and bounds external events into canonical internal `ConnectorEvent`s.
- **Fake Connector Implementation** — `createFakeConnectorAdapter` (data layer) +
  a compact test double (application layer). Deterministic, offline, no SDK.

### UI

- `/workspace/integrations` — **Installed Connectors** (status + health).
- `/workspace/integrations/marketplace` — **Connector Marketplace** grid.
- `/workspace/integrations/marketplace/[connectorId]` — **Connector Details** +
  install form (renders the descriptor's config schema; secret fields are password
  inputs, never echoed).
- `/workspace/integrations/[installationId]` — **Installation Details**: status,
  health, config, capabilities, lifecycle controls, and the recent event / health /
  audit streams.

## 4. Layering (Schema → Domain → Data → Application → Web)

```
packages/schema/src/integration.ts            enums + entity zod contracts
packages/domain/src/integration/              registry · lifecycle · config · oauth
                                              idempotency · health · failures · redaction
                                              translation · events · builders
                                              adapter-port (PORTS) · repository (PORTS) · index
packages/data/src/integration/                adapter (8 Supabase repos) · mappers
                                              env-secret-store · fake-connector-adapter
supabase/migrations/20260806000100_…sql       8 tables · RLS · grants · append-only triggers
supabase/tests/phase_f_integration_platform_test.sql   pgTAP
packages/application/src/integration/         installation/secret/oauth/ingestion use-cases
                                              integration-read · dto · testing · index
apps/web/src/lib/integration-data.ts          read seam (buildAppContext → read models)
apps/web/src/app/workspace/integrations/…      4 routes + actions + 2 client components
```

See [01-domain-model.md](01-domain-model.md), [02-architecture.md](02-architecture.md),
[03-authorization-security.md](03-authorization-security.md),
[04-data-model.md](04-data-model.md), [05-ui.md](05-ui.md),
[06-testing.md](06-testing.md), and [07-definition-of-done.md](07-definition-of-done.md).

## 5. Quality gate

`pnpm turbo run typecheck lint test build` — **36/36 tasks green**. New tests:
**~30 domain** (`integration.test.ts`) + **21 application** (full flow through the
Fake adapters) + **pgTAP** (existence · RLS · enums · optimistic concurrency ·
append-only · secret/oauth internal-only · tenant isolation · idempotency uniques).

**Sandbox limitation (honest):** this environment has no Docker/Supabase, so the
`db-verify` job (migrate · pgTAP · generated-type drift) runs only in CI. The
generated DB types are regenerated from the CI `generated-db-types` artifact and
committed as a follow-up `chore(db)` commit — the same Docker-less flow every prior
phase used. Until then, the data adapter compiles via the one documented
`as unknown as SupabaseClient` cast, so `verify` (typecheck/lint/test/build) is green.

## 6. Inviolable rules (enforced, not assumed)

1. **No vendor connector is implemented** — only the framework + Fake connectors.
2. **Raw secrets are never stored, logged, returned, or placed in a DTO** — only
   references + validation posture; values flow to `ConnectorSecretStore` and are
   resolved only at the adapter boundary.
3. **Provider content is untrusted DATA** — translated + sanitized, never obeyed;
   payloads pass through `sanitizeConnectorMetadata` (secret-key stripping).
4. **Ingestion is idempotent & replay-safe** — structural keys; a replayed webhook /
   poll writes no duplicate event.
5. **Auxion is the system of record** — the external provider is never authoritative.
6. **Every write is capability-checked, tenant-owned (RLS is the final boundary), and
   audited** (append-only `connector_audit_event`).
7. **The domain is Node-free & deterministic** — no `crypto`/`URL`/clock; `now` is a
   parameter; PKCE/signature crypto lives in adapters.

## 7. Git

One PR on `feat/f4-integration-core`, **left open**, CI awaited. Only F4-related
issues are addressed. Not merged.
