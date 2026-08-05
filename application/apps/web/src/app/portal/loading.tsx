import { PageSkeleton, SkeletonBlock } from "@brightloop/ui";
import shell from "../admin/admin.module.css";

/**
 * Client-portal route-loading placeholder. A single boundary at the segment root:
 * the persistent sidebar stays put while this reproduces the page chrome (topbar +
 * content box) around a structured skeleton, so navigating any `/portal/*` route
 * shows instant, layout-shaped feedback instead of a frozen previous page. It
 * cascades to every child segment that doesn't define its own `loading.tsx`.
 */
export default function Loading() {
  return (
    <>
      <div className={shell.topbar}>
        <SkeletonBlock width="180px" height="1.4rem" radius="var(--radius-md)" />
      </div>
      <div className={shell.content}>
        <PageSkeleton variant="list" header={false} label="Loading" />
      </div>
    </>
  );
}
