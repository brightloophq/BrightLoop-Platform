#!/usr/bin/env bash
# =============================================================================
# Live database verification — the one command a developer runs locally.
#
#   pnpm --filter @brightloop/db db:verify
#
# It reproduces exactly what the CI `db-verify` job does, against a real
# ephemeral local Supabase (Docker):
#   1. start Supabase           (idempotent — reuses a running stack)
#   2. db reset                 (apply every migration from a clean DB + seed)
#   3. supabase test db         (pgTAP: transition guards + RLS/cross-tenant)
#   4. adapter integration tests (Sprint 2 SupabaseTransformationRepository)
#   5. generated-type drift check (regenerated types must match the committed file)
#
# PREREQUISITES
#   - Docker running
#   - Supabase CLI installed (https://supabase.com/docs/guides/cli)
#
# No production credentials are used or required — all keys come from the local
# stack's own `supabase status -o env`. The local stack is left running on exit
# so re-runs are fast; stop it with `pnpm --filter @brightloop/db exec supabase stop`.
# =============================================================================
set -euo pipefail

# Resolve the application root (this script lives in <app>/scripts/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

echo "==> [1/5] Starting Supabase (idempotent)…"
supabase start

echo "==> [2/5] Resetting DB (clean migrate + seed)…"
supabase db reset

echo "==> [3/5] Running pgTAP tests (transition guards + RLS)…"
supabase test db

echo "==> [4/5] Running adapter integration tests…"
# Map the local stack's own credentials into the test env. `set -a` exports
# every var sourced from the status block for the child process.
set -a
# shellcheck disable=SC1090
eval "$(supabase status -o env)"
export SUPABASE_TEST_URL="$API_URL"
export SUPABASE_TEST_SERVICE_KEY="$SERVICE_ROLE_KEY"
export SUPABASE_TEST_ANON_KEY="$ANON_KEY"
export SUPABASE_TEST_JWT_SECRET="$JWT_SECRET"
set +a
pnpm --filter @brightloop/data test:integration

echo "==> [5/5] Checking generated types are in sync…"
pnpm --filter @brightloop/db gen:types:check

echo ""
echo "✓ Live database verification passed."
echo "  (local Supabase left running — stop with: pnpm --filter @brightloop/db exec supabase stop)"
