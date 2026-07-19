import { may, type Actor } from "@brightloop/domain";
import type { AdminNavGroup } from "@/app/admin/AdminNav";

/**
 * The Auxion transformation command-center navigation — the product's primary
 * nav. Pure and capability-driven so it renders identically on desktop and in
 * the mobile drawer, and can be unit-tested without React.
 *
 * Visibility is by CAPABILITY, never role name (hidden, not disabled): the core
 * cycle needs `transformation.read` (every internal role has it; client roles do
 * not, so it never leaks onto the portal); Settings needs `settings.read`
 * (owner/admin only). RLS is still the real boundary — this only shapes the menu.
 */
export const TRANSFORMATION_NAV = [
  { label: "Console", href: "/admin/dashboard", icon: "layout-grid" },
  { label: "Business Scan", href: "/admin/business-scan", icon: "gauge" },
  { label: "Activation", href: "/admin/activation", icon: "workflow" },
  { label: "Signals", href: "/admin/signals", icon: "activity" },
  { label: "Insights", href: "/admin/insights", icon: "lightbulb" },
  { label: "Recommendations", href: "/admin/recommendations", icon: "sparkles" },
  { label: "Approvals", href: "/admin/approvals", icon: "check-circle" },
  { label: "Moves", href: "/admin/moves", icon: "git-branch" },
  { label: "Measurements", href: "/admin/measurements", icon: "line-chart" },
  { label: "Knowledge", href: "/admin/knowledge", icon: "book-open" },
] as const;

/**
 * Build the Transformation nav group for an actor, or null when they may see
 * none of it (e.g. a client role). Every returned item routes to a real page
 * (dashboard built; the rest are Coming-Soon placeholders, never dead links).
 */
export function transformationNavGroup(actor: Actor): AdminNavGroup | null {
  const items: AdminNavGroup["items"] = [];

  if (may(actor, "transformation.read")) {
    for (const item of TRANSFORMATION_NAV) items.push({ ...item, ready: true });
  }
  if (may(actor, "settings.read")) {
    items.push({ label: "Settings", href: "/admin/settings", icon: "settings", ready: true });
  }

  return items.length > 0 ? { label: "Transformation", items } : null;
}
