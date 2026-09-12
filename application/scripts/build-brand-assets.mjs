/* =============================================================================
 * Derive every in-product brand asset from the supplied artwork.
 *
 * The files in brand-assets/ are THE SOURCE OF TRUTH — the client's own artwork.
 * Nothing here redraws, recolours or re-traces them; the only operations are
 * trim (to content bounds), resize (downscale only, Lanczos) and composite onto
 * a flat ground. Re-run after replacing a source file:
 *
 *   node scripts/build-brand-assets.mjs
 *
 * Outputs are committed so a build never depends on this script, but they must
 * be regenerated — never hand-edited — when the artwork changes.
 * ========================================================================== */

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "..", "brand-assets");
const PUBLIC = join(here, "..", "apps", "web", "public", "brand");
const APP = join(here, "..", "apps", "web", "src", "app");

/** The identity's own ground — --bg in the dark theme (tokens/colors.css). */
const BLACK = { r: 5, g: 5, b: 5, alpha: 1 };

await mkdir(PUBLIC, { recursive: true });

/** Trim to content bounds so callers size the ARTWORK, not its padding. */
async function trimTo(src, out) {
  const info = await sharp(join(SRC, src))
    .trim({ threshold: 1 })
    .png({ compressionLevel: 9 })
    .toFile(join(PUBLIC, out));
  console.log(`public/brand/${out}  ${info.width}x${info.height}`);
  return info;
}

/**
 * A square app icon: the mark centred on the black ground at `inset` padding.
 * Favicons and touch icons sit on arbitrary browser/OS chrome, so they carry
 * their own ground rather than relying on transparency.
 */
async function appIcon(size, inset, out, dir = APP) {
  const markBox = Math.round(size * (1 - inset * 2));
  const mark = await sharp(join(SRC, "auxion-monogram.png"))
    .trim({ threshold: 1 })
    .resize({ width: markBox, height: markBox, fit: "inside", withoutEnlargement: false })
    .toBuffer({ resolveWithObject: true });
  await sharp({ create: { width: size, height: size, channels: 4, background: BLACK } })
    .composite([{ input: mark.data, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(join(dir, out));
  console.log(`${out}  ${size}x${size} (mark ${mark.info.width}x${mark.info.height})`);
}

/** The social card: the stacked lockup centred on black at 1200x630. */
async function openGraph() {
  const W = 1200, H = 630;
  const art = await sharp(join(SRC, "auxion-logo-transparent-trimmed.png"))
    .trim({ threshold: 1 })
    .resize({ width: Math.round(W * 0.42), fit: "inside" })
    .toBuffer({ resolveWithObject: true });
  await sharp({ create: { width: W, height: H, channels: 4, background: BLACK } })
    .composite([{ input: art.data, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(join(APP, "opengraph-image.png"));
  console.log(`opengraph-image.png  ${W}x${H} (art ${art.info.width}x${art.info.height})`);
}

await trimTo("auxion-monogram.png", "mark.png");
await trimTo("auxion-wordmark.png", "wordmark.png");
await trimTo("auxion-logo-transparent-trimmed.png", "lockup-stacked.png");

// 512 for the favicon (browsers downscale); 180 is Apple's touch-icon size.
await appIcon(512, 0.08, "icon.png");
await appIcon(180, 0.07, "apple-icon.png");
await openGraph();
