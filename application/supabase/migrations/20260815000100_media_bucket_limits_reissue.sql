-- =============================================================================
-- 20260815000100 — Re-issue the media bucket limits under a version that will
-- actually run.
--
-- WHY THIS EXISTS AT ALL
--   `supabase db push` records applied migrations by their numeric VERSION, not
--   by filename. The production database had `20260812000100` applied from a
--   file named `20260812000100_quote_proposal_statuses.sql`, pushed from a
--   working copy whose migration history had diverged from this repository.
--
--   This repository's `20260812000100` is a different migration entirely —
--   `20260812000100_media_bucket_limits.sql`. Because that version is already
--   recorded as applied, a push from this repository SKIPS it, silently, and
--   the limits never reach the bucket. `supabase migration list` shows the
--   version present in both columns, which is exactly what makes it invisible.
--
--   Renaming history on a live database is the riskier repair. This is the
--   safe one: the same statement, under a version nothing has claimed.
--
-- SAFE TO RUN TWICE. It is a plain UPDATE of one row to fixed values — running
-- it after the original would change nothing. If `20260812000100` from this
-- repository ever does run, the two agree.
--
-- The limits themselves, unchanged from the original: 8 MiB matches
-- MAX_UPLOAD_BYTES in apps/web/src/lib/media-upload.ts (the client one fails
-- fast with a readable message; this one actually enforces, for every caller).
-- image/svg+xml is ABSENT on purpose — it is the one raster-shaped format that
-- is really a script container, and this bucket is public-read.
-- =============================================================================

update storage.buckets
set
  file_size_limit = 8388608, -- 8 MiB
  allowed_mime_types = array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/avif',
    'image/gif'
  ]
where id = 'media';
