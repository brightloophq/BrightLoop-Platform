/* =============================================================================
 * PageSkeleton plan — the PURE structural description of a route-loading skeleton.
 *
 * No React/DOM here, so the "does the skeleton match the layout" contract is
 * unit-testable in a node environment (the house test style). PageSkeleton.tsx
 * renders this plan; nothing else decides skeleton shape.
 * ========================================================================== */

export type PageSkeletonVariant = "table" | "grid" | "analytics" | "detail" | "list";

/** A single placeholder block (maps 1:1 to a <SkeletonBlock/>). */
export interface SkelBlock {
  readonly height: string;
  readonly radius: string;
  readonly width?: string;
}

/** A labelled group of blocks; the role selects the wrapper/layout in the view. */
export interface SkeletonGroup {
  readonly role: "toolbar" | "rows" | "grid" | "kpi" | "panels" | "detailMain" | "detailAside";
  readonly blocks: readonly SkelBlock[];
}

export interface SkeletonPlan {
  readonly variant: PageSkeletonVariant;
  /** Page-header placeholder (title + subtitle + action) precedes the groups. */
  readonly header: boolean;
  readonly groups: readonly SkeletonGroup[];
}

const R = {
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  xl: "var(--radius-xl)",
} as const;

/** Sensible unit counts per variant when the caller doesn't specify one. */
const DEFAULT_COUNT: Record<PageSkeletonVariant, number> = {
  table: 6,
  grid: 6,
  analytics: 4,
  detail: 0,
  list: 5,
};

const rows = (n: number, height: string): SkelBlock[] =>
  Array.from({ length: n }, () => ({ height, radius: R.lg }));

/**
 * Build the structural plan for a route skeleton. `count` overrides the repeated
 * unit count (rows / cards / panels); it is clamped to ≥ 1 for variants that repeat.
 */
export function pageSkeletonPlan(
  variant: PageSkeletonVariant,
  opts: { header?: boolean; count?: number } = {},
): SkeletonPlan {
  const header = opts.header ?? true;
  const n = Math.max(1, opts.count ?? DEFAULT_COUNT[variant]);

  switch (variant) {
    case "table":
      return {
        variant,
        header,
        groups: [
          {
            role: "toolbar",
            blocks: [
              { width: "220px", height: "38px", radius: R.md },
              { width: "96px", height: "38px", radius: R.md },
            ],
          },
          { role: "rows", blocks: rows(n, "56px") },
        ],
      };
    case "grid":
      return {
        variant,
        header,
        groups: [
          { role: "grid", blocks: Array.from({ length: n }, () => ({ height: "148px", radius: R.xl })) },
        ],
      };
    case "analytics":
      return {
        variant,
        header,
        groups: [
          { role: "kpi", blocks: Array.from({ length: 4 }, () => ({ height: "96px", radius: R.lg })) },
          { role: "panels", blocks: Array.from({ length: n }, () => ({ height: "240px", radius: R.xl })) },
        ],
      };
    case "detail":
      return {
        variant,
        header,
        groups: [
          {
            role: "detailMain",
            blocks: [
              { height: "180px", radius: R.xl },
              { height: "320px", radius: R.xl },
            ],
          },
          {
            role: "detailAside",
            blocks: [
              { height: "140px", radius: R.xl },
              { height: "200px", radius: R.xl },
            ],
          },
        ],
      };
    case "list":
    default:
      return {
        variant: "list",
        header,
        groups: [{ role: "rows", blocks: rows(n, "72px") }],
      };
  }
}
