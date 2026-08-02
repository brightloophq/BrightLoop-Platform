# F4.1 · Data model

Migration `supabase/migrations/20260806000100_phase_f_integration_platform.sql` —
**additive only**, eight tables, no prior table touched. pgTAP:
`supabase/tests/phase_f_integration_platform_test.sql`.

## Tables

| Table | Root kind | Key constraints |
|---|---|---|
| `connector_installation` | versioned | `version>0`; `unique(idempotency_key)`; `unique(workspace_id, connector_id)` |
| `connector_secret_reference` | mutable, internal-only | FK → installation |
| `connector_health_snapshot` | append-only | FK → installation |
| `connector_event` | append-only | `unique(idempotency_key)` |
| `connector_webhook_receipt` | append-only | `unique(idempotency_key)` |
| `connector_polling_cursor` | append-only | `unique(idempotency_key)` |
| `connector_oauth_grant` | mutable, internal-only | `unique(state_token)` |
| `connector_audit_event` | append-only | FK → installation |

Every tenant-scoped table carries `workspace_id`, `client_id text references
public.clients(id) on delete cascade`, and `created_at`. Versioned roots add
`version` + `updated_at`. Enum values are enforced by `check` constraints (mirroring
the Zod enums 1:1). Indexes cover `(workspace_id, created_at desc)`,
`(client_id)`, `(connector_id)`, per-installation history, and idempotency keys.

## Append-only enforcement

The five append-only tables get a `<table>_no_mutation` trigger via the shared
`public.bl_txexec_append_only()` function (reused from Phase D), plus **no
`update`/`delete` grant** — a defence-in-depth pair.

## RLS & grants

Applied in `do $$ … format() $$` loops (the F3 idiom):

- root read/write: `create policy … using (bl_is_internal() or client_id =
  bl_client_id())` for select; `for all … using (bl_is_internal())` for write.
- secret + oauth: single internal-only `for all` policy.
- append-only: client-read-own select + internal insert; `grant select, insert`.
- `service_role` gets `all` on every table (server-only; bypasses RLS).

## Generated types

New tables require regenerating `packages/db/generated/database.types.ts`. This
sandbox has no Docker, so regeneration runs in CI (`gen:types:local`) and the file is
committed from the `generated-db-types` artifact as a follow-up `chore(db)` commit —
the Docker-less flow every prior phase used. The data adapter compiles meanwhile via
the one documented `as unknown as SupabaseClient` cast; mappers are the type boundary.
