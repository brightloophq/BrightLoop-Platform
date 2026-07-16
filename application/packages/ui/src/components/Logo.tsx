import type { SVGProps } from "react";

export type LogoVariant = "mark" | "wordmark" | "lockup";

export interface LogoProps extends Omit<SVGProps<SVGSVGElement>, "height"> {
  variant?: LogoVariant;
  /** Rendered height in px. Width scales with the variant's aspect ratio. */
  height?: number;
}

/**
 * Logo — the BrightLoop loop mark.
 *
 * PLACEHOLDER GEOMETRY. The only supplied asset (brand-assets/MY IDENTITY.png)
 * is a raster with a navy background baked in, so it cannot be used on arbitrary
 * surfaces. Open decision 21 requests the vector package (mark + wordmark +
 * lockup, transparent, light/dark, favicon, OG). This SVG is a faithful stand-in
 * built from the brand gradient token so the shell is complete and on-palette —
 * replace it when the real vectors arrive.
 */
export function Logo({ variant = "lockup", height = 28, ...rest }: LogoProps) {
  const showMark = variant === "mark" || variant === "lockup";
  const showWord = variant === "wordmark" || variant === "lockup";
  const width = variant === "mark" ? height : variant === "wordmark" ? height * 5.2 : height * 6.4;
  const gradientId = `bl-loop-${variant}`;

  return (
    <svg
      viewBox={`0 0 ${variant === "mark" ? 32 : variant === "wordmark" ? 166 : 205} 32`}
      height={height}
      width={width}
      role="img"
      aria-label="BrightLoop"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
      </defs>

      {showMark ? (
        <g>
          {/* The loop: an open ring, gapped to read as a continuous cycle. */}
          <path
            d="M16 4a12 12 0 1 1-8.49 3.51"
            stroke={`url(#${gradientId})`}
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="16" cy="16" r="3.5" fill={`url(#${gradientId})`} />
        </g>
      ) : null}

      {showWord ? (
        <text
          x={variant === "lockup" ? 42 : 0}
          y="22"
          fill="currentColor"
          fontFamily="var(--font-display), system-ui, sans-serif"
          fontSize="21"
          fontWeight="700"
          letterSpacing="-0.02em"
        >
          BrightLoop
        </text>
      ) : null}
    </svg>
  );
}
