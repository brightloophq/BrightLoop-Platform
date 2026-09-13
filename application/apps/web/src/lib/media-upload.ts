/* =============================================================================
 * Media upload — deciding what an uploaded portfolio image is allowed to be.
 *
 * Pure and unit-tested, separate from the server action that performs the
 * upload, so the rules can be exercised without Supabase.
 * ========================================================================== */

/** 8 MB. A hero photograph that needs more than this needs resizing, not more budget. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * MIME type → the extension we will STORE the object under.
 *
 * The stored extension is not cosmetic. A Supabase public object URL ends in
 * whatever path we chose, and the public site's `resolveEmbed` only treats a URL
 * as an image when it ends in a known image extension — so an object saved
 * without one would upload happily and then refuse to render, with nothing to
 * explain why.
 *
 * SVG is deliberately absent. It is the one raster-shaped format that is really
 * a script container, and nothing here needs it: project photography is raster.
 * An owner who genuinely has an SVG can still paste a URL to one they host.
 */
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

/** The same set spelled as filename suffixes, for the fallback below. */
const EXTENSION_BY_SUFFIX: Readonly<Record<string, string>> = {
  png: "png",
  jpg: "jpg",
  jpeg: "jpg",
  webp: "webp",
  avif: "avif",
  gif: "gif",
};

export const ACCEPTED_UPLOAD_TYPES = Object.keys(EXTENSION_BY_MIME).join(",");

/** Human list for error copy, in the order an owner would say them. */
export const ACCEPTED_UPLOAD_LABEL = "JPG, PNG, WebP, AVIF or GIF";

/**
 * The extension to store this upload under, or null if we will not accept it.
 *
 * The browser's MIME type is consulted FIRST and the filename only as a
 * fallback, because the filename is the easier of the two for a caller to
 * control — and a `.png` suffix on something that is not a PNG is exactly the
 * shape of a mislabelled upload. Neither is a content check: the real guarantee
 * is that this bucket is writable only by owner/admin (storage migration 0006).
 */
export function uploadExtension(mime: string, filename: string): string | null {
  const byMime = EXTENSION_BY_MIME[mime.toLowerCase().trim()];
  if (byMime) return byMime;

  const suffix = filename.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_BY_SUFFIX[suffix] ?? null;
}

/**
 * Storage object path for a portfolio image.
 *
 * Flat under `portfolio/`, keyed by an opaque id rather than the project slug:
 * a project can be renamed, and an object path that embeds a slug would either
 * go stale or have to be rewritten on every rename. The original filename is
 * NOT part of the path — it carries no meaning to a visitor and would leak
 * whatever the owner happened to call the file.
 */
export function mediaObjectPath(objectId: string, extension: string): string {
  return `portfolio/${objectId}.${extension}`;
}

/** Size rejection copy, in megabytes, because bytes mean nothing to a reader. */
export function tooLargeMessage(bytes: number): string {
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  const limit = MAX_UPLOAD_BYTES / (1024 * 1024);
  return `That image is ${mb} MB — the limit is ${limit} MB. Resize it and try again.`;
}
