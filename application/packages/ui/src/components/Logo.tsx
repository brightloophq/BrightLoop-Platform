import type { SVGProps } from "react";

export type LogoVariant = "mark" | "wordmark" | "lockup";

export interface LogoProps extends Omit<SVGProps<SVGSVGElement>, "height"> {
  variant?: LogoVariant;
  /** Rendered height in px. Width scales with the variant's aspect ratio. */
  height?: number;
}

/**
 * Logo — the Auxion blueprint mark (hexagonal "A") + AUXION wordmark.
 *
 * The mark's facet + navy fills are fixed brand colors and read on both the dark
 * navy canvas and the light "paper" theme (the white hairlines and drawn hexagon
 * keep it legible on either). The wordmark uses currentColor so it inherits the
 * surrounding text colour (white on dark headers, navy on paper).
 */
function Mark({ gradientId }: { gradientId: string }) {
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#2a4a86" />
          <stop offset="1" stopColor="#17274d" />
        </linearGradient>
      </defs>
      <polygon points="300,104 469.7,202 300,300 130.3,202" fill="#c6cfd8" />
      <polygon points="130.3,202 300,300 300,496 130.3,398" fill="#b1bdc9" />
      <polygon points="469.7,202 469.7,398 300,496 300,300" fill="#9dabb9" />
      <polygon points="300,158 272.582,354 327.418,354" fill="#93a1af" stroke="#ffffff" strokeWidth={9} strokeLinejoin="round" />
      <polygon points="262,140 300,140 252,470 176,470" fill={`url(#${gradientId})`} stroke="#ffffff" strokeWidth={9} strokeLinejoin="round" />
      <polygon points="338,140 300,140 348,470 424,470" fill={`url(#${gradientId})`} stroke="#ffffff" strokeWidth={9} strokeLinejoin="round" />
      <polygon points="268.582,356 331.418,356 336.655,392 263.345,392" fill={`url(#${gradientId})`} stroke="#ffffff" strokeWidth={9} strokeLinejoin="round" />
      <polygon points="300,404 338,436 300,468 262,436" fill="#95a3b1" stroke="#ffffff" strokeWidth={9} strokeLinejoin="round" />
      <polygon points="300,44 521.7,172 521.7,428 300,556 78.3,428 78.3,172" fill="none" stroke="#9aa8b6" strokeWidth={15} strokeLinejoin="round" />
    </>
  );
}

export function Logo({ variant = "lockup", height = 28, ...rest }: LogoProps) {
  const gradientId = `auxion-mark-${variant}`;

  if (variant === "mark") {
    return (
      <svg viewBox="0 0 600 600" height={height} width={height} role="img" aria-label="Auxion" xmlns="http://www.w3.org/2000/svg" {...rest}>
        <Mark gradientId={gradientId} />
      </svg>
    );
  }

  if (variant === "wordmark") {
    // AUXION in Sora — currentColor so it adapts to the surface.
    return (
      <svg viewBox="0 0 1000 400" height={height} width={height * 2.5} role="img" aria-label="Auxion" xmlns="http://www.w3.org/2000/svg" {...rest}>
        <text x="0" y="288" fontFamily="var(--font-display), Sora, system-ui, sans-serif" fontWeight={800} fontSize="240" letterSpacing="8" fill="currentColor">
          AUXION
        </text>
      </svg>
    );
  }

  // lockup: mark + wordmark
  return (
    <svg viewBox="0 0 1480 400" height={height} width={height * 3.7} role="img" aria-label="Auxion" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <g transform="translate(10,0) scale(0.6333)">
        <Mark gradientId={gradientId} />
      </g>
      <text x="450" y="268" fontFamily="var(--font-display), Sora, system-ui, sans-serif" fontWeight={800} fontSize="210" letterSpacing="6" fill="currentColor">
        AUXION
      </text>
    </svg>
  );
}
