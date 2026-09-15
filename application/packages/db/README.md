# @brightloop/db

Supabase schema for the BrightLoop platform: enums, tables, the state-transition
guard, RLS policies, the auth claims hook, and storage buckets.

> **The SQL now lives in `application/supabase/migrations/`**, not here — that is
> the layout the Supabase CLI requires. This package keeps the scripts and this
> documentation. Contents were moved unchanged.

> **Status: authored, NOT applied.** A hosted project exists but these migrations
> have never executed against it. Nothing here has touched production data.

## Migrations (applied in filename order)

| File | Purpose |
|---|---|
| `20260716000100_enums.sql` | Postgres enums generated from `packages/schema` MACHINES + ROLES. An illegal status **value** cannot be stored. |
| `20260716000200_tables.sql` | The 18 canonical entities. Client is the aggregate root; every client-scoped table carries `client_id`. |
| `20260716000300_transition_guard.sql` | `state_transitions` (DB mirror of MACHINES), the generic `BEFORE UPDATE` trigger, and the append-only `transition_log`. An illegal status **move** is rejected by the database. |
| `20260716000400_rls.sql` | RLS on every table. Claim helpers (`bl_role`, `bl_client_id`, `bl_is_internal`, `bl_is_finance`) + policies. **This is the authorization boundary.** |
| `20260716000500_auth_claims.sql` | The custom access token hook that stamps `role` + `client_id` into the JWT. RLS depends on it. |
| `20260716000600_storage.sql` | Buckets (`deliverables`, `media`, `avatars`, `contracts`) + path-scoped access. Only `media` is public-read. |
| `20260716000700_reputation.sql` | `portfolio_projects` + `testimonials`, and the anon publish gate (`public`/`featured` only). |

Order is load-bearing: `0400` defines `bl_is_internal()` / `bl_client_id()`, which
`0600` and `0700` depend on.

## ⚠️ Outstanding history divergence — read before merging `feat/canonical-proposal-issuance`

Production has two migrations that live on that branch and not on `main`:

| Version | On the branch | On `main` |
| --- | --- | --- |
| `20260812000100` | `quote_proposal_statuses` (applied in production) | `media_bucket_limits` (never applied) |
| `20260812000200` | `canonical_proposal_issuance` (applied in production) | — |

Two consequences, both already live:

1. **`20260812000100_media_bucket_limits.sql` can never apply.** Its version was
   claimed by a different file. `20260815000100_media_bucket_limits_reissue.sql`
   carries the same statement under a free version and is what actually runs.
2. **`20260812000200` was marked reverted** in `schema_migrations` so a push from
   `main` could proceed. The objects it created are still in the database — only
   the bookkeeping row was removed.

**When that branch is merged, in this order:**

```bash
# 1. re-record the migration the database really does have
supabase migration repair --status applied 20260812000200

# 2. delete main's dead file, whose version the branch's migration now owns
git rm application/supabase/migrations/20260812000100_media_bucket_limits.sql

# 3. regenerate, because main's committed types do not describe those two
pnpm --filter @brightloop/db gen:types:local
```

Skipping step 1 means the merged `canonical_proposal_issuance.sql` is treated as
unapplied and re-run against objects that already exist. Skipping step 2 leaves
two files sharing version `20260812000100`, which the CLI rejects.

## Applying

**On merge to `main`, CI applies them** — `.github/workflows/migrate-production.yml`,
triggered only when `application/supabase/migrations/**` changes. It requires three
repository secrets and **fails loudly if any is missing**, because a workflow that
quietly skips would recreate the drift it exists to prevent:

| Secret | What it is |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | A personal access token (Supabase dashboard → Account → Access Tokens) |
| `SUPABASE_PROJECT_REF` | The project ref from the project's URL |
| `SUPABASE_DB_PASSWORD` | The database password, so `link` does not prompt |

Point the job's `production` environment at a protection rule if you want a human
approval before any production DDL.

⚠️ **Ordering is improved, not guaranteed.** Vercel and Netlify build from their own
git integrations on the same push, in parallel. Migrations apply in seconds and a
build takes minutes, so the schema normally lands first — but only turning off the
host's automatic deploys and deploying from a step after the migration would
actually enforce it.

### By hand

Still the path for a backlog, a recovery, or a project the workflow is not linked to:

```bash
export SUPABASE_ACCESS_TOKEN=<personal access token>   # or: supabase login
supabase link --project-ref <ref>                      # prompts for the DB password
supabase db push
```

Then register the auth hook: **Authentication → Hooks → Custom Access Token →
`public.custom_access_token_hook`**.

⚠️ **Without that dashboard step, no JWT carries `role`/`client_id`, so every RLS
policy denies and the app looks entirely broken.** That is the hook not being
registered — not a bug. `config.toml` registers hooks for LOCAL dev only; hosted
must be done in the dashboard.

Regenerate TypeScript DB types after any migration:

```bash
pnpm --filter @brightloop/db gen:types
```

## Design notes

- **`schema.js` wins.** If a machine changes in `packages/schema`, add a migration
  that updates `state_transitions` to match. The two must not drift.
- **`users.id` keeps the prefixed ULID** (`usr_…`) from the handoff convention and
  links to Supabase Auth via `auth_user_id uuid → auth.users(id)`.
- **`Project.milestoneIds`** is modeled as the `milestones.project_id` foreign key
  rather than a stored array — it is derived, per handoff §02.4.
- **`Project.progress`** is a column for read performance but is **derived** from
  milestone completion; it is not the source of truth.
- **Writes are internal-only in Sprint 0.** Client write paths (approve a
  deliverable, pay an invoice, sign a contract) each get a narrow, reviewed policy
  in the sprint that delivers them. There is deliberately no blanket client-write grant.
- **`transition_log` and `consents` are append-only** (enforced by trigger/policy).
- **Never store PAN.** `payments` holds only `last4` + `method`; Stripe holds the token.

## Live database verification

One command runs the whole live gate — the same steps CI's `db-verify` job runs,
against a real ephemeral local Supabase (never production):

```bash
pnpm --filter @brightloop/db db:verify
```

It (1) starts Supabase, (2) resets the DB — applying every migration from clean +
seed, (3) runs the pgTAP suite (`supabase test db`), (4) runs the transformation
adapter integration tests (`@brightloop/data test:integration`) — approval gate,
idempotent execution, cross-tenant isolation — and (5) fails if the generated
types have drifted from the committed file.

**Prerequisites:** Docker running + the [Supabase CLI](https://supabase.com/docs/guides/cli).
No production credentials are used — every key comes from the local stack's own
`supabase status`. The stack is left running afterward; stop it with
`pnpm --filter @brightloop/db exec supabase stop`.

Common failure causes:

| Symptom | Cause / fix |
|---|---|
| `supabase: command not found` | Install the Supabase CLI. |
| `Cannot connect to the Docker daemon` | Start Docker Desktop / the Docker service. |
| Port already in use (54321–54323) | Another stack is running: `supabase stop`, or free the port. |
| Integration tests **skipped** | The `SUPABASE_TEST_*` env is unset — run via `db:verify` (or export from `supabase status -o env`), don't call `test:integration` bare. |
| Type-drift step fails | Migrations changed the schema: run `pnpm --filter @brightloop/db gen:types:local` and commit `generated/database.types.ts`. |

## Verification (before any production data)

These are the checks the Sprint 6/9 gates must pass:

1. A `client_admin` for org A gets **zero rows** for every org-B record, via direct
   PostgREST calls with a crafted `client_id`.
2. Every illegal transition in `packages/schema` is rejected by the DB trigger,
   not just by the service layer.
3. `transition_log` rejects UPDATE and DELETE.
4. A JWT with no `role` claim can read nothing.
