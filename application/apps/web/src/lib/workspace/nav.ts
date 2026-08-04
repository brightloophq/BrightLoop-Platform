/**
 * Workspace Experience — navigation model (Phase F · Sprint F1).
 *
 * PURE. The client product shell's navigation, active-section resolution, and
 * breadcrumb trail are computed here so the UI stays thin and the logic is unit
 * tested (the repo convention: factor logic out of components, test it directly).
 * No React, no io.
 */

export interface WorkspaceNavItem {
  key: string;
  label: string;
  href: string;
  /** lucide icon name resolved by the shell. */
  icon: string;
  /** Optional live badge count key the shell fills from read-model data. */
  badgeKey?: "approvals" | "notifications";
}

/** The primary sidebar of the client Workspace Experience. */
export const WORKSPACE_NAV: readonly WorkspaceNavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/workspace", icon: "layout-grid" },
  { key: "projects", label: "Projects", href: "/workspace/projects", icon: "route" },
  { key: "ai-team", label: "AI Team", href: "/workspace/ai-team", icon: "users" },
  { key: "copilot", label: "Copilot", href: "/workspace/copilot", icon: "sparkles" },
  { key: "automations", label: "Automations", href: "/workspace/automations", icon: "workflow" },
  { key: "deployments", label: "Deployments", href: "/workspace/deployments", icon: "rocket" },
  { key: "runtimes", label: "Runtimes", href: "/workspace/runtimes", icon: "git-branch" },
  { key: "integrations", label: "Integrations", href: "/workspace/integrations", icon: "plug" },
  { key: "executions", label: "Executions", href: "/workspace/executions", icon: "gauge" },
  { key: "reports", label: "Reports", href: "/workspace/reports", icon: "line-chart" },
  { key: "approvals", label: "Approvals", href: "/workspace/approvals", icon: "check-circle", badgeKey: "approvals" },
  { key: "activity", label: "Activity", href: "/workspace/activity", icon: "activity" },
  { key: "billing", label: "Billing", href: "/workspace/settings/billing", icon: "credit-card" },
  { key: "settings", label: "Settings", href: "/workspace/settings", icon: "settings" },
];

/** The nav key whose href is the longest prefix of the current path (or dashboard). */
export function activeNavKey(pathname: string): string {
  let best = "dashboard";
  let bestLen = -1;
  for (const item of WORKSPACE_NAV) {
    const exact = pathname === item.href;
    const nested = item.href !== "/workspace" && pathname.startsWith(item.href + "/");
    const root = item.href === "/workspace" && pathname === "/workspace";
    if ((exact || nested || root) && item.href.length > bestLen) { best = item.key; bestLen = item.href.length; }
  }
  return best;
}

export interface Breadcrumb { label: string; href: string }

const HUMANIZE: Record<string, string> = { "ai-team": "AI Team", kpis: "KPIs" };
function humanize(segment: string): string {
  if (HUMANIZE[segment]) return HUMANIZE[segment]!;
  if (/^[a-z0-9]{2,}_[a-z0-9]/i.test(segment) || segment.length > 24) return "Detail"; // opaque id
  return segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The breadcrumb trail for a workspace pathname, always rooted at "Workspace". */
export function breadcrumbs(pathname: string): Breadcrumb[] {
  const parts = pathname.split("/").filter(Boolean); // ["workspace", ...]
  const trail: Breadcrumb[] = [{ label: "Workspace", href: "/workspace" }];
  let href = "/workspace";
  for (let i = 1; i < parts.length; i += 1) {
    href += `/${parts[i]}`;
    trail.push({ label: humanize(parts[i]!), href });
  }
  return trail;
}
