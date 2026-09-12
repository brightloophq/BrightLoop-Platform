import type { CSSProperties, SVGProps } from "react";

export type LogoVariant = "mark" | "wordmark" | "lockup";

export interface LogoProps extends Omit<SVGProps<SVGSVGElement>, "height"> {
  variant?: LogoVariant;
  /** Rendered height in px. Width scales with the variant's aspect ratio. */
  height?: number;
}

/**
 * Logo — the Auxion identity: a folded metallic ribbon "A" over the AUXION
 * wordmark.
 *
 * ⚠ STAND-IN, NOT THE FINAL MARK. The geometry below is a reconstruction drawn
 * from the identity, not the client's own artwork: the real mark's apex is a
 * ROUNDED ribbon fold (not a mitred point), its crossbar is a folded-back tab,
 * and the upper-right slash is a detached parallelogram. Replace this with the
 * supplied asset — see "Brand B.4" in ENGINEERING_CONTEXT.md — and do not
 * redraw the mark by hand again.
 *
 * GEOMETRY. The mark is one continuous ribbon that enters at the lower left,
 * crosses the apex and OVERSHOOTS to the upper right (`RIBBON`), tucked against
 * a shorter right leg folding in behind it (`LEG`) and joined by a crossbar that
 * passes behind both (`BAR`). The leg and bar are mitred exactly along the
 * ribbon's own edges — every shared vertex below is a computed edge intersection,
 * not an eyeballed one — so the fold reads as a single strap rather than three
 * overlapping shapes. Painted back-to-front: bar, leg, ribbon, specular.
 *
 * COLOUR. Every fill resolves from --brand-1…--brand-4, which are theme-aware:
 * the ramp samples a darker span on paper and a brighter span on black, so the
 * mark keeps its metal on either ground without a second asset. The three facets
 * deliberately take DIFFERENT spans of that ramp — ribbon bright, leg in shadow,
 * bar mid — because one flat gradient across all three reads as plastic. There
 * is no off-token hex in this file.
 *
 * Token references go through `style`, never a presentation attribute: `var()`
 * is CSS, and browsers do not evaluate it inside `fill="…"` / `stop-color="…"`.
 *
 * Gradient ids are keyed by variant, so two same-variant lockups on one page
 * emit the same id. That is deliberate and safe — the defs are byte-identical,
 * so the first wins and both render correctly — and it keeps the component
 * render-deterministic (a `useId` value contains ":" and cannot appear in
 * `url(#…)`).
 */

/* --- Ribbon: lower-left → apex → overshoot upper-right (horizontal width 84) --- */
const RIBBON = "70,530 154,530 500,45 416,45";
/* --- Leg: lower-right → apex, mitred along the ribbon's left edge --- */
const LEG = "446,530 530,530 364.7,116.8 310.9,192.3";
/* --- Crossbar: passes behind both legs, ends mitred to their inner edges --- */
const BAR = "250,395 392,395 416,455 207,455";
/* --- Specular: a thin highlight riding the ribbon's left edge --- */
const SPECULAR = "70,530 88,530 434,45 416,45";

const stop = (token: string): CSSProperties => ({ stopColor: `var(${token})` });

const WORD_STYLE: CSSProperties = {
  fontFamily: "var(--font-display), 'Space Grotesk', system-ui, sans-serif",
  fontWeight: 600,
};

/** Gradient defs. Shared by every variant so the mark and wordmark match exactly. */
function Defs({ id }: { id: string }) {
  return (
    <defs>
      {/* The ribbon's full sweep: fold → core → sheen → core → fold. */}
      <linearGradient id={`${id}-ribbon`} x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" style={stop("--brand-1")} />
        <stop offset="0.22" style={stop("--brand-3")} />
        <stop offset="0.5" style={stop("--brand-4")} />
        <stop offset="0.78" style={stop("--brand-3")} />
        <stop offset="1" style={stop("--brand-2")} />
      </linearGradient>
      {/* The leg sits in the ribbon's shadow — a darker span of the same ramp. */}
      <linearGradient id={`${id}-leg`} x1="1" y1="1" x2="0" y2="0">
        <stop offset="0" style={stop("--brand-1")} />
        <stop offset="0.55" style={stop("--brand-2")} />
        <stop offset="1" style={stop("--brand-3")} />
      </linearGradient>
      {/* The bar is furthest back: mid-ramp, no sheen. */}
      <linearGradient id={`${id}-bar`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" style={stop("--brand-2")} />
        <stop offset="0.5" style={stop("--brand-3")} />
        <stop offset="1" style={stop("--brand-1")} />
      </linearGradient>
      <linearGradient id={`${id}-word`} x1="0" y1="0" x2="1" y2="0.6">
        <stop offset="0" style={stop("--brand-2")} />
        <stop offset="0.42" style={stop("--brand-4")} />
        <stop offset="1" style={stop("--brand-3")} />
      </linearGradient>
    </defs>
  );
}

function Mark({ id }: { id: string }) {
  return (
    <>
      <polygon points={BAR} fill={`url(#${id}-bar)`} />
      <polygon points={LEG} fill={`url(#${id}-leg)`} />
      <polygon points={RIBBON} fill={`url(#${id}-ribbon)`} />
      <polygon points={SPECULAR} style={{ fill: "var(--brand-4)" }} opacity={0.55} />
    </>
  );
}

/**
 * AUXION — display capitals, letterspaced hard as in the identity.
 */
function Word({ id, x, y, size, tracking }: { id: string; x: number; y: number; size: number; tracking: number }) {
  return (
    <text x={x} y={y} style={WORD_STYLE} fontSize={size} letterSpacing={tracking} fill={`url(#${id}-word)`}>
      AUXION
    </text>
  );
}

export function Logo({ variant = "lockup", height = 28, ...rest }: LogoProps) {
  const id = `auxion-${variant}`;

  if (variant === "mark") {
    return (
      <svg viewBox="0 0 600 600" height={height} width={height} role="img" aria-label="Auxion" xmlns="http://www.w3.org/2000/svg" {...rest}>
        <Defs id={id} />
        <Mark id={id} />
      </svg>
    );
  }

  if (variant === "wordmark") {
    return (
      <svg viewBox="0 0 1060 260" height={height} width={height * (1060 / 260)} role="img" aria-label="Auxion" xmlns="http://www.w3.org/2000/svg" {...rest}>
        <Defs id={id} />
        <Word id={id} x={12} y={196} size={190} tracking={46} />
      </svg>
    );
  }

  /* lockup: mark, then wordmark to its right on a shared optical centre. */
  return (
    <svg viewBox="0 0 1760 420" height={height} width={height * (1760 / 420)} role="img" aria-label="Auxion" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <Defs id={id} />
      <g transform="translate(0,10) scale(0.6667)">
        <Mark id={id} />
      </g>
      <Word id={id} x={470} y={292} size={196} tracking={48} />
    </svg>
  );
}
