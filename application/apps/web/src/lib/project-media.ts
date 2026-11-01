import { MEDIA_KINDS, type MediaItem, type MediaKind } from "@brightloop/schema";

/* =============================================================================
 * Project media — read the admin form's media rows into catalogued MediaItems.
 *
 * Pure and unit-tested, and in its own module rather than inside
 * `reputation-actions.ts`, because that file is `"use server"`: every export
 * there must be an async server action, so a synchronous helper living in it
 * could never be exported or tested.
 * ========================================================================== */

/** Media rows are capped — a case study is a story, not an asset dump. */
export const MEDIA_LIMIT = 12;

/** Caption length. Long enough to name a screen, short enough to stay a label. */
export const MEDIA_LABEL_MAX = 120;

export type ReadMediaResult = { media: MediaItem[] } | { error: string };

export function isMediaKind(value: string): value is MediaKind {
  return (MEDIA_KINDS as readonly string[]).includes(value);
}

/**
 * Read a project's media from the three PARALLEL arrays `MediaFields` submits —
 * `mediaKind`, `mediaLabel`, `mediaUrl` — one entry per row, empties included.
 *
 * Zipping by index rather than parsing JSON from the client means there is no
 * user-supplied STRUCTURE to trust: the shape is fixed here and every field is
 * validated on its own.
 *
 * A row with an empty URL is a DELETED row, so it is skipped silently — that is
 * how the form removes an item. A row with a URL we cannot accept is an ERROR,
 * never a silent drop: quietly discarding it would let an owner save, see the
 * photo not appear, and have nothing to explain why.
 *
 * https only. `resolveEmbed` refuses every other scheme on the public side and
 * the CSP carries `upgrade-insecure-requests`, so an http URL stored here would
 * render as a dead link — better to say so at the point of entry.
 */
export function readProjectMedia(formData: FormData): ReadMediaResult {
  const kinds = formData.getAll("mediaKind").map(String);
  const labels = formData.getAll("mediaLabel").map(String);
  const urls = formData.getAll("mediaUrl").map(String);

  const media: MediaItem[] = [];

  for (let i = 0; i < urls.length; i += 1) {
    const raw = (urls[i] ?? "").trim();
    if (raw === "") continue;

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return { error: `Media item ${i + 1}: "${raw.slice(0, 60)}" is not a valid web address.` };
    }

    if (parsed.protocol !== "https:") {
      return {
        error: `Media item ${i + 1} must start with https:// — ${parsed.protocol} won't load.`,
      };
    }

    if (media.length >= MEDIA_LIMIT) {
      return { error: `A project can hold ${MEDIA_LIMIT} media items; remove one first.` };
    }

    const kind = kinds[i] ?? "";
    media.push({
      kind: isMediaKind(kind) ? kind : "image",
      label: (labels[i] ?? "").trim().slice(0, MEDIA_LABEL_MAX),
      url: parsed.toString(),
    });
  }

  return { media };
}
