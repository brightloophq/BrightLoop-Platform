# Disposable database and commercial browser verification

The `db-verify` CI job uses Node 22, pnpm 9.15.0, Supabase CLI 2.116.0,
and Chromium from pinned Playwright 1.64.1. No GitHub/production database secrets
are required. `prepare-ci-db.mjs` copies only config, migrations, seed, and tests
to a fresh runner directory with a unique `auxion-ci-*` project ID. It copies no
link markers or local credentials. `supabase start --workdir` applies the entire
migration chain on first start; the job never resets a database.

The job runs pgTAP, builds workspace dependencies, runs all adapter integration
tests, builds the real Next app with local Supabase values, runs browser tests,
then reruns pgTAP with those persistent fixtures present. Finally it checks
generated-type drift and stops only its own disposable project. Every command's
failure fails the job. No auth traces, screenshots, videos, or storage-state files
are uploaded. Local credentials are masked before child commands run.

## Reuse an existing disposable local stack

Do not run these commands against a linked project. The wrapper checks the
explicit workdir, project ID, absence of link markers, loopback API/database URLs,
actual running Docker project label, and database port. It replaces inherited
Supabase configuration and exports the actual `SUPABASE_TEST_DB_CONTAINER`.
Missing auth/container configuration is fatal, preventing skipped race tests.

```sh
cd application
export PATH="$PWD/.pnpm-store/auxion-toolchain/bin:$PATH"
export AUXION_DB_WORKDIR=/private/tmp/auxion-s1b-20261022-local
pnpm --filter @brightloop/db db:verify
```

That command does not start services, apply migrations, reset data, or overwrite
generated types. A type-drift failure leaves its temporary candidate for review.

For browser acceptance, build the consumed workspace packages first, then:

```sh
pnpm -r --filter @brightloop/schema --filter @brightloop/domain --filter @brightloop/application --filter @brightloop/data --filter @brightloop/providers --filter @brightloop/crawler build
pnpm exec playwright install chromium
node scripts/with-local-db.mjs -- pnpm --filter @brightloop/web build
node scripts/with-local-db.mjs -- pnpm test:browser
node scripts/with-local-db.mjs -- supabase test db --local --workdir "$AUXION_DB_WORKDIR"
```

Playwright starts a fresh production server on `127.0.0.1:3108`; an existing
listener is rejected. It follows the official [web-server setup](https://playwright.dev/docs/test-webserver).
Fixtures create real synthetic local owner/team accounts and log in through the
existing login form. There is no application auth bypass or mocked review API.
Each test creates its own run and immutable versions; fixtures are deliberately
retained rather than deleting protected history. Narrative and pricing revisions
use the real persistence adapter and immutable proposal lineage.

Scenarios cover the rendered review panel, valid approval, pricing field
preservation, stale pricing save 409 and recovery, approval invalidation after a
new proposal version, narrative revision, re-review, missing/expired terms, and
team-member UI/API restrictions. Approval assertions use no browser reload;
the automatic-refresh regression also asserts zero main-frame navigations. A
further regression proves that a stale 409 clears prior client-ready display.
Explicit reloads remain only for observing externally inserted revisions and
recovering from stale browser preconditions.

Sprint 1D.1 traced the stale display to a missing live-state handoff: the action
discarded its persisted review response, while the server-rendered panel relied
solely on a full-workspace `router.refresh()`. The refreshed Flight root contained
the approved view, but React retained the old UI in a suspended render transition
(router action completed; render lane pending/suspended; no stylesheet commit
wait). There was no panel state/callback to consume the completed decision.

The panel now validates and projects the authoritative successful response for
the exact versions currently displayed. No optimistic approval is constructed.
A mismatched response fails closed; a 409 clears client readiness. Fresh server
props supersede the completion snapshot, so old callbacks cannot overwrite newer
versions, expiry, or readiness. The workspace refresh remains for reconciliation.
This scopes the fix to the review panel rather than changing Next/React internals;
the lower-level cause of the full-workspace render suspension was not established.
Browser artifacts are disabled because
[authenticated state is sensitive](https://playwright.dev/docs/auth).

## Queue-test isolation

`runtime_lease_rpc_test.sql` exercises a deliberately cross-tenant lease RPC.
Before inserting its own fixtures, it defers previously queued jobs to infinity
inside its existing transaction. Every original assertion remains, including
cross-tenant filtering and priority order. Its final rollback restores the
pre-existing jobs; it changes no production queue behavior.
