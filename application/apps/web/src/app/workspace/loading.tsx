import { PageSkeleton } from "@brightloop/ui";

/**
 * Workspace route-loading placeholder. A single boundary at the segment root: the
 * persistent shell (sidebar · topbar) stays put while this structured skeleton
 * fills the content area, so navigating any `/workspace/*` route shows instant,
 * layout-shaped feedback instead of a frozen previous page. It cascades to every
 * child segment that doesn't define its own `loading.tsx`.
 */
export default function Loading() {
  return <PageSkeleton variant="list" label="Loading workspace" />;
}
