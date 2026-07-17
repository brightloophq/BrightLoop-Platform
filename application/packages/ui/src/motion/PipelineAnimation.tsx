import type { ReactNode } from "react";

/**
 * Wraps the transformation pipeline so its stages join the dashboard entrance
 * timeline. The wrapper itself is the `pipeline` group; individual stage nodes
 * opt in with `<PipelineAnimation.Node>`, which the timeline staggers. Server-safe
 * markers only — motion is driven centrally by DashboardEntrance.
 */
export function PipelineAnimation({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}

/** A single pipeline stage — staggered as part of the `pipeline` group. */
function Node({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-animate="pipeline" style={{ willChange: "transform, opacity" }} className={className}>
      {children}
    </div>
  );
}

PipelineAnimation.Node = Node;
