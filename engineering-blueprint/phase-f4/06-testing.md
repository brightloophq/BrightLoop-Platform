# F4.1 · Testing

Vitest (Node env, pure logic — the repo convention), pgTAP for the DB, all offline
and deterministic.

## Domain — `packages/domain/src/integration/integration.test.ts` (~30 tests)

Registry (available vs example, frozen descriptors, category/trigger/capability
lookups); installation + OAuth lifecycle legality; config validation + secret
separation + unknown-key drop + completeness + capability resolution; OAuth pure
helpers (state build/verify, scope normalize/satisfy, expiry); event translation
(dedupe by `(externalId,type)`, malformed drop, payload sanitization, batch cap);
redaction (`isSecretKey`, `sanitizeConnectorMetadata`, `hasNoConnectorSecrets`);
health/failure mapping; deterministic idempotency keys; builders (no secret in
config, reference stores only a ref).

## Application — `packages/application/src/integration/integration.test.ts` (21 tests)

Drives the full framework through the Fake adapters + in-memory repos + in-memory
secret store:

- marketplace / descriptor reads; config fields never expose secret values.
- install → secret separated → `configuring`; duplicate rejected; unavailable
  connector rejected; missing-required rejected; reconfigure → back to `configuring`.
- validate → `connected`; health snapshot appended (immutable).
- **OAuth**: begin (authorize URL + state) → complete (state verified, code
  exchanged, token stored by reference) → validate → `connected`; forged state
  rejected.
- **Webhook**: invalid signature → `rejected`; verified → events persisted;
  **replay → `duplicate`, no new events** (idempotent).
- **Polling**: cursor advances across turns; 4 distinct events, no duplicates.
- secret rotation (new version, value never surfaces); revoke (references →
  `revoked`); enable/disable transitions.
- **authorization**: a client actor cannot install (`ForbiddenError`); a client
  cannot read an internal-owned installation.
- **secret non-leakage**: the serialized detail view contains no secret value, no
  `secretRef`, no `idempotencyKey`.

## Database — `supabase/tests/phase_f_integration_platform_test.sql` (pgTAP)

Table existence + RLS enabled; enum `check` rejection; `unique(workspace,connector)`
+ `unique(idempotency_key)` rejection; optimistic-concurrency update; append-only
UPDATE/DELETE rejection (P0001); secret + oauth **internal-only** (same-org client
reads installations/events/health but 0 secret references and 0 oauth grants);
tenant isolation (other-org client sees nothing); client cannot write an installation
(42501).

## Gate

`pnpm turbo run typecheck lint test build` → **36/36 green**. The live `db-verify`
(migrate · pgTAP · type-drift) runs in CI (no Docker in the sandbox).
