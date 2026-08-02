# F4.1 · Definition of Done

## Requested build items

- [x] Connector Registry — `CONNECTOR_REGISTRY` (pure, additive, indexed)
- [x] Connector Domain — descriptor + capability + config contracts
- [x] Connector Installation — versioned tenant-scoped root
- [x] Connector Lifecycle — guarded state machine (+ OAuth-grant machine)
- [x] Connector Capability Model — declared capabilities, enable-list resolution
- [x] Connector Health — append-only snapshots + pure health→status mapping
- [x] Connector Configuration — validation + secret/non-secret split
- [x] Secret References — internal-only rows + `ConnectorSecretStore` port
- [x] OAuth Abstraction — pure state/scope/expiry + adapter build/exchange/refresh
- [x] Provider Adapter Port — `ConnectorAdapter` + registry
- [x] Webhook Abstraction — verify → translate → persist; idempotent receipts
- [x] Polling Abstraction — cursor-based, replay-safe
- [x] Event Translation — validate + sanitize + dedupe + bound → canonical events
- [x] Connector Marketplace UI — `/workspace/integrations/marketplace`
- [x] Installed Connectors UI — `/workspace/integrations`
- [x] Connector Details UI — `/workspace/integrations/[installationId]` (+ marketplace detail/install)
- [x] Fake Connector Implementation — data-layer adapter + application test double
- [x] Full test suite — domain + application + pgTAP

## Explicitly NOT implemented (per mission)

- [x] No Gmail, Slack, Shopify, Stripe, HubSpot, QuickBooks, Meta, LinkedIn — only
      the framework + the deterministic Fake connectors and vendor-neutral examples.

## Quality bar

- [x] deterministic (domain Node-free, `now` a parameter)
- [x] capability-driven (`integration.*` matrix + `authorize` funnel)
- [x] authorization-aware (three layers; ownership on the loaded row)
- [x] tenant-isolated (RLS internal-write / client-read-own; secrets internal-only)
- [x] replay-safe & idempotent (structural keys + `unique(idempotency_key)`)
- [x] audited (append-only `connector_audit_event` + transitions)
- [x] fully tested (~51 new unit tests + pgTAP)
- [x] additive only (no prior schema/table/contract changed)
- [x] `pnpm turbo run typecheck lint test build` → 36/36 green

## Follow-ups (tracked, not blocking the framework)

- [ ] Commit regenerated `database.types.ts` from the CI `generated-db-types`
      artifact (Docker-less flow) so the `db-verify` type-drift check is zero.
- [ ] Update repo-root `ENGINEERING_CONTEXT.md` (done in this PR).
- [ ] First real connector (a later sprint) implements `ConnectorAdapter` in
      `@brightloop/data` + registers in `createDefaultConnectorAdapters` — no
      framework change required.

## Git

- [x] One PR on `feat/f4-integration-core` (off `main`)
- [x] CI awaited; only F4-related issues fixed
- [x] PR left **open** — not merged
