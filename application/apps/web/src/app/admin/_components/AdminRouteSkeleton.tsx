import { PageSkeleton, type PageSkeletonVariant } from "@brightloop/ui";
import shell from "../admin.module.css";

/**
 * The route-loading placeholder for the CMS/ops admin surfaces. Reproduces the real
 * page chrome (topbar + content box) around a structured `PageSkeleton`, so a
 * navigation shows instant, layout-matching feedback instead of a frozen previous
 * page — and nothing jumps when the server component resolves.
 *
 * Server component (no client boundary). Each route's `loading.tsx` is a two-line
 * host that picks the title + variant matching that route's real shape.
 */
export function AdminRouteSkeleton({
  title,
  variant = "list",
}: {
  title: string;
  variant?: PageSkeletonVariant;
}) {
  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>{title}</h1>
      </div>
      <div className={shell.content}>
        <PageSkeleton variant={variant} label={`Loading ${title}`} />
      </div>
    </>
  );
}
