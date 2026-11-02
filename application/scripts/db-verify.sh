#!/usr/bin/env bash
# Verify an explicitly selected, already-running disposable local database.
# Never start, reset, link, or migrate the repository's own Supabase project.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
: "${AUXION_DB_WORKDIR:?Set AUXION_DB_WORKDIR to an unlinked disposable AUXION project}"
node --test scripts/with-local-db.test.mjs
node scripts/with-local-db.mjs -- supabase test db --local --workdir "$AUXION_DB_WORKDIR"
pnpm --filter @brightloop/schema --filter @brightloop/domain build
node scripts/with-local-db.mjs -- pnpm --filter @brightloop/data test:integration
node scripts/with-local-db.mjs -- supabase test db --local --workdir "$AUXION_DB_WORKDIR"
# Compare a candidate without overwriting committed generated types.
CANDIDATE_TYPES="$(mktemp "${TMPDIR:-/tmp}/auxion-db-types.XXXXXX")"
supabase gen types typescript --local --workdir "$AUXION_DB_WORKDIR" > "$CANDIDATE_TYPES"
diff -u packages/db/generated/database.types.ts "$CANDIDATE_TYPES"
echo "Local database checks passed; disposable database left running."
