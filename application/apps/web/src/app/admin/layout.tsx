import type { ReactNode } from "react";
import { may } from "@brightloop/domain";
import { ToastProvider } from "@brightloop/ui";
import { requireSurface } from "@/lib/auth";
import { transformationNavGroup } from "@/lib/transformation-nav";
import { AppSidebar } from "./AppSidebar";
import type { AdminNavGroup } from "./AdminNav";
import { DemoModeBanner } from "../_components/DemoModeBanner";
import styles from "./admin.module.css";

/**
 * Auxion command-center layout — server-side surface guard + capability-gated nav.
 *
 * THREE INDEPENDENT CHECKS, none of which trusts the others:
 *   1. middleware — cheap early exit on the role claim
 *   2. requireSurface() here — re-asserts in the Server Component tree, so a
 *      client that ignores middleware still cannot render this
 *   3. RLS — refuses the underlying rows regardless
 *
 * Nav groups are filtered by CAPABILITY, not by role name. The Transformation
 * group is the product's primary navigation; the agency back-office groups follow.
 * Per handoff §09.3 role-gated items are HIDDEN, not disabled — and hiding them
 * here is convenience, not security. RLS is what actually stops them.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireSurface("admin");

  const groups: AdminNavGroup[] = [];

  // Primary navigation: the transformation command center.
  const transformation = transformationNavGroup(actor);
  if (transformation) groups.push(transformation);

  // Agency back-office (existing modules).
  groups.push({
    label: "Overview",
    items: [{ label: "Home", href: "/admin", ready: true }],
  });
  groups.push({
    label: "Sales",
    items: [
      { label: "Leads", href: "/admin/leads", ready: true },
      { label: "Proposals", href: "/admin/proposals", ready: true },
      { label: "Contracts", href: "/admin/contracts", ready: true },
    ],
  });
  groups.push({
    label: "Delivery",
    items: [
      { label: "Conversations", href: "/admin/conversations", ready: true },
      { label: "Clients", href: "/admin/clients", ready: true },
      { label: "Projects", href: "/admin/projects", ready: true },
      { label: "Deliverables", href: "/admin/deliverables", ready: false },
    ],
  });

  // finance.* — owner/admin only. team_member must not see it at all.
  if (may(actor, "finance.read")) {
    groups.push({
      label: "Finance",
      items: [{ label: "Invoices", href: "/admin/invoices", ready: true }],
    });
  }

  // marketing.* — owner/admin only. This is the Reputation CMS.
  if (may(actor, "marketing.read")) {
    groups.push({
      label: "Marketing",
      items: [
        { label: "Portfolio", href: "/admin/portfolio", ready: true },
        { label: "Reviews", href: "/admin/reviews", ready: true },
        { label: "Media", href: "/admin/media", ready: false },
        { label: "Content", href: "/admin/content", ready: false },
      ],
    });
  }

  const ops: AdminNavGroup = { label: "Ops", items: [] };
  if (may(actor, "team.read")) {
    ops.items.push({ label: "Team", href: "/admin/team", ready: false });
  }
  if (may(actor, "analytics.read")) {
    ops.items.push({ label: "Analytics", href: "/admin/analytics", ready: true });
  }
  if (may(actor, "automation.read")) {
    ops.items.push({ label: "Automation", href: "/admin/automation", ready: true });
  }
  if (ops.items.length > 0) groups.push(ops);

  return (
    <div className={styles.shell}>
      <AppSidebar groups={groups} roleLabel={actor.role} />
      <main id="main-content" tabIndex={-1} className={styles.main}>
        <DemoModeBanner />
        <ToastProvider>{children}</ToastProvider>
      </main>
    </div>
  );
}
