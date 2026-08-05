import { SkeletonBlock } from "./SkeletonBlock";
import { pageSkeletonPlan, type PageSkeletonVariant, type SkeletonGroup } from "./PageSkeleton.plan";
import styles from "./PageSkeleton.module.css";

export type { PageSkeletonVariant } from "./PageSkeleton.plan";

export interface PageSkeletonProps {
  /** Body shape — pick the one that matches the real route (default `table`). */
  variant?: PageSkeletonVariant;
  /** Render the page-header placeholder (title + subtitle + action). Default true. */
  header?: boolean;
  /** How many repeated units (rows / cards / panels) to draw. Sensible per-variant default. */
  count?: number;
  /** Accessible label announced while the route loads. */
  label?: string;
}

/**
 * PageSkeleton — the ONE structured route-loading placeholder every `loading.tsx`
 * composes, so "navigating" looks identical product-wide and never flashes a bare
 * spinner or a blank canvas. Built only from `SkeletonBlock` (a transform/opacity
 * pulse that goes static under `prefers-reduced-motion`), it reserves the real
 * layout's dimensions to prevent content-jump when data resolves.
 *
 * Shape comes entirely from the pure `pageSkeletonPlan` (unit-tested); this view
 * only maps the plan to blocks. It is an `aria-busy` live region with an `sr-only`
 * label, and the visual blocks are `aria-hidden`, so assistive tech hears
 * "Loading …" once, not a wall of shapes.
 */
export function PageSkeleton({ variant = "table", header = true, count, label = "Loading" }: PageSkeletonProps) {
  const plan = pageSkeletonPlan(variant, { header, count });

  return (
    <div className={styles.page} role="status" aria-busy="true" aria-live="polite">
      <span className={styles.srOnly}>{label}…</span>
      {plan.header ? <HeaderSkeleton /> : null}
      {variant === "detail" ? (
        <div className={styles.detail}>
          {plan.groups.map((group, i) => (
            <Group key={i} group={group} />
          ))}
        </div>
      ) : (
        plan.groups.map((group, i) => <Group key={i} group={group} />)
      )}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className={styles.header}>
      <div className={styles.headText}>
        <SkeletonBlock width="42%" height="1.9rem" radius="var(--radius-md)" />
        <SkeletonBlock width="64%" height="0.9rem" radius="var(--radius-sm)" />
      </div>
      <SkeletonBlock width="128px" height="42px" radius="var(--radius-md)" className={styles.headAction} />
    </div>
  );
}

const GROUP_CLASS: Record<SkeletonGroup["role"], string> = {
  toolbar: styles.toolbar!,
  rows: styles.rows!,
  grid: styles.grid!,
  kpi: styles.kpiRow!,
  panels: styles.panelGrid!,
  detailMain: styles.detailMain!,
  detailAside: styles.detailAside!,
};

function Group({ group }: { group: SkeletonGroup }) {
  return (
    <div className={GROUP_CLASS[group.role]}>
      {group.blocks.map((b, i) => (
        <SkeletonBlock key={i} width={b.width} height={b.height} radius={b.radius} />
      ))}
    </div>
  );
}
