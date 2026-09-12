import styles from "./Logo.module.css";

export type LogoVariant = "mark" | "wordmark" | "lockup" | "stacked";

export interface LogoProps {
  variant?: LogoVariant;
  /** Rendered height in px. Width follows the artwork's own aspect ratio. */
  height?: number;
  className?: string;
  /**
   * Override the plate. The plate exists because the artwork is gold-on-dark
   * (see the note below) — pass `false` only for a surface you KNOW is dark in
   * both themes, and `true` to force it. Default: the stylesheet decides, which
   * is almost always what you want.
   */
  plate?: boolean;
}

/**
 * Logo — the Auxion identity, served as the SUPPLIED ARTWORK.
 *
 * This component does not draw the logo. It renders the client's own files from
 * `apps/web/public/brand/`, derived from `brand-assets/` by
 * `scripts/build-brand-assets.mjs` using trim + downscale only. Nothing here
 * recolours, re-traces or reconstructs the mark, and nothing should: an earlier
 * revision of this file contained a hand-drawn approximation, and it was wrong
 * in ways only a side-by-side comparison revealed. If the artwork changes,
 * replace the source file and re-run the script.
 *
 * THE PLATE, and why it is not optional on paper. The artwork is built for a
 * dark ground. Measured against the light theme's canvas (--bg #F5F2EA) its
 * median luminance gives only ~2.3:1 and its specular highlights ~1.06:1 —
 * far below the 3:1 WCAG 1.4.11 floor for a graphical object, and visibly
 * washed out. Against the dark canvas the same pixels give ~7.9:1. So on a
 * light surface the mark sits on its own near-black plate, which is standard
 * practice for a metallic identity and keeps the artwork untouched. The plate
 * is applied by CSS on the light theme only, so Light/Dark/System still works
 * with one asset.
 *
 * VARIANTS. `stacked` is the supplied lockup exactly as delivered (mark over
 * wordmark). `lockup` is the horizontal arrangement, composed here from the
 * supplied mark and wordmark as separate elements — the stacked artwork is
 * ~1.6:1 and illegible in a 26px header, which is precisely why the mark and
 * wordmark ship as their own files.
 *
 * Sizing is by HEIGHT with width derived from the artwork's true content
 * dimensions (below), so every call site is layout-stable without `next/image`
 * and there is no CLS.
 */

/** Content dimensions of the generated files. Keep in step with the script. */
const ART = {
  mark: { src: "/brand/mark.png", w: 553, h: 305 },
  wordmark: { src: "/brand/wordmark.png", w: 776, h: 95 },
  stacked: { src: "/brand/lockup-stacked.png", w: 776, h: 479 },
} as const;

/** The horizontal lockup's proportions: mark height, then a gap, then the word. */
const LOCKUP = {
  /** Wordmark cap-height relative to the mark's height — optically matched. */
  wordScale: 0.34,
  /** Gap between mark and wordmark, relative to the mark's height. */
  gap: 0.3,
} as const;

function scaled(art: { w: number; h: number }, height: number) {
  return { width: Math.round((art.w / art.h) * height), height };
}

/**
 * The plate's padding, derived from the rendered height so it scales with the
 * mark. Passed as a CSS variable because the stylesheet cannot know the height,
 * and an `em` there would track an inherited font-size that has nothing to do
 * with the artwork's size.
 */
function plateVars(height: number) {
  return { ["--logo-pad" as string]: `${Math.max(3, Math.round(height * 0.26))}px` };
}

export function Logo({ variant = "lockup", height = 28, className, plate }: LogoProps) {
  const plateClass = plate === false ? styles.noPlate : plate === true ? styles.forcePlate : null;
  const wrap = [styles.logo, plateClass, className].filter(Boolean).join(" ");

  if (variant === "lockup") {
    const mark = scaled(ART.mark, height);
    const wordHeight = Math.round(height * LOCKUP.wordScale);
    const word = scaled(ART.wordmark, wordHeight);
    return (
      <span
        className={wrap}
        style={{ ...plateVars(height), gap: `${Math.round(height * LOCKUP.gap)}px` }}
        role="img"
        aria-label="Auxion"
      >
        <img src={ART.mark.src} alt="" width={mark.width} height={mark.height} className={styles.img} />
        <img src={ART.wordmark.src} alt="" width={word.width} height={word.height} className={styles.img} />
      </span>
    );
  }

  const art = variant === "mark" ? ART.mark : variant === "wordmark" ? ART.wordmark : ART.stacked;
  const { width } = scaled(art, height);
  return (
    <span className={wrap} style={plateVars(height)}>
      <img src={art.src} alt="Auxion" width={width} height={height} className={styles.img} />
    </span>
  );
}
