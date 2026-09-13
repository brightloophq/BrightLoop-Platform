-- =============================================================================
-- 20260812000100 — Size and type limits on the public `media` bucket.
--
-- Portfolio images are uploaded STRAIGHT FROM THE BROWSER to Storage, using a
-- short-lived signed upload URL that the admin issues after its capability
-- check. That is what makes a real photograph uploadable at all: a Next.js
-- server action caps its request body at 1 MB by default, and Vercel caps a
-- serverless request at 4.5 MB, so a file routed through the server could never
-- be a camera-sized image.
--
-- Because the bytes never touch our server, application code is no longer a
-- place where size or type can be enforced. This is: the bucket itself rejects
-- anything too large or of the wrong type, for every caller, forever.
--
-- 8 MB matches MAX_UPLOAD_BYTES in apps/web/src/lib/media-upload.ts. The two are
-- deliberately the same number — the client one exists to fail fast with a
-- readable message, this one to actually enforce.
--
-- image/svg+xml is ABSENT on purpose: it is the one raster-shaped format that is
-- really a script container, and this bucket is public-read.
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
