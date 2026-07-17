import type { ReactNode } from "react";

/**
 * Declares a metric card as a member of the dashboard entrance timeline. It is a
 * thin, server-safe marker — the actual reveal is driven by the single
 * DashboardEntrance timeline, which selects `[data-animate="metric"]`. Grouping
 * the marker in one component (rather than sprinkling raw data-attributes) keeps
 * the choreography discoverable and the card markup clean.
 *
 * `will-change: transform` is a light hint so the compositor is ready for the
 * short translate/opacity reveal; it costs nothing when motion is reduced.
 */
export function AnimatedMetric({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-animate="metric" style={{ willChange: "transform, opacity" }} className={className}>
      {children}
    </div>
  );
}
