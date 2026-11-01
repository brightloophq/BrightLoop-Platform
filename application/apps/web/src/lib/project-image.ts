/* =============================================================================
 * The image that stands for a project.
 *
 * The Work index and the case-study hero must agree: a client whose tile shows
 * a photograph cannot open onto a page that claims no image exists. They now
 * ask the same function.
 *
 * `resolveEmbed` stays the ONLY authority on what a media URL actually is — a
 * URL ending `.png` from an arbitrary host is an image, a YouTube link is not,
 * and nothing that fails its checks is ever dropped into an `<img>`.
 * ========================================================================== */

import type { MediaItem } from "@brightloop/schema";
import { resolveEmbed } from "@brightloop/ui";

export interface ProjectImage {
  src: string;
  /** The label the CMS stored, used as alt text where one is needed. */
  label: string;
}

/**
 * The first media row that resolves to a real image, or null.
 *
 * Order is the CMS's order, so the person editing the project decides which
 * image leads simply by putting it first — no separate "hero" field to keep in
 * step, and nothing to configure before a case study looks right.
 */
export function firstUsableImage(media: readonly MediaItem[]): ProjectImage | null {
  for (const item of media) {
    const embed = resolveEmbed(item.url);
    if (embed.kind === "image" && embed.src) return { src: embed.src, label: item.label };
  }
  return null;
}
