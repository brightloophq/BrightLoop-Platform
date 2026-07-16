import type { ReactNode } from "react";
import Link from "next/link";
import { may } from "@brightloop/domain";
import { Logo } from "@brightloop/ui";
import { requireSurface } from "@/lib/auth";
import { signOut } from "../(auth)/actions";
import { AdminNav, type AdminNavGroup } from "./AdminNav";
import styles from "./admin.module.css";

/**
 * Admin command center layout — server-side surface guard + capability-gated nav.
 *
 * THREE INDEPENDENT CHECKS, none of which trusts the others:
 *   1. middleware — cheap early exit on the role claim
 *   2. requireSurface() here — re-asserts in the Server Component tree, so a
 *      client that ignores middleware still cannot render this
 *   3. RLS — refuses the underlying rows regardless
 *
 * Nav groups are filtered by CAPABILITY, not by role name: `team_member` never
 * sees Finance or Marketing because it lacks `finance.*` / `marketing.*`. Per
 * handoff §09.3 role-gated items are HIDDEN, not disabled — and hiding them here
 * is convenience, not security. RLS is what actually stops them.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireSurface("admin");

  const groups: AdminNavGroup[] = [
    {
      label: "Overview",
      items: [{ label: "Dashboard", href: "/admin", icon: "layout-grid", ready: true }],
    },
    {
      label: "Sales",
      items: [
        { label: "Leads", href: "/admin/leads", icon: "route", ready: true },
        { label: "Proposals", href: "/admin/proposals", icon: "search", ready: true },
        { label: "Contracts", href: "/admin/contracts", icon: "check-circle", ready: true },
      ],
    },
    {
      label: "Delivery",
      items: [
        { label: "Conversations", href: "/admin/conversations", icon: "mail", ready: true },
        { label: "Clients", href: "/admin/clients", icon: "users", ready: true },
        { label: "Projects", href: "/admin/projects", icon: "workflow", ready: true },
        { label: "Deliverables", href: "/admin/deliverables", icon: "check", ready: false },
      ],
    },
  ];

  // finance.* — owner/admin only. team_member must not see it at all.
  if (may(actor, "finance.read")) {
    groups.push({
      label: "Finance",
      items: [{ label: "Invoices", href: "/admin/invoices", icon: "trending-up", ready: true }],
    });
  }

  // marketing.* — owner/admin only. This is the Reputation CMS.
  if (may(actor, "marketing.read")) {
    groups.push({
      label: "Marketing",
      items: [
        { label: "Portfolio", href: "/admin/portfolio", icon: "star", ready: true },
        { label: "Reviews", href: "/admin/reviews", icon: "heart", ready: true },
        { label: "Media", href: "/admin/media", icon: "palette", ready: false },
        { label: "Content", href: "/admin/content", icon: "sparkles", ready: false },
      ],
    });
  }

  const ops: AdminNavGroup = { label: "Ops", items: [] };
  if (may(actor, "team.read")) {
    ops.items.push({ label: "Team", href: "/admin/team", icon: "users", ready: false });
  }
  if (may(actor, "analytics.read")) {
    ops.items.push({ label: "Analytics", href: "/admin/analytics", icon: "line-chart", ready: true });
  }
  if (may(actor, "automation.read")) {
    ops.items.push({ label: "Automation", href: "/admin/automation", icon: "workflow", ready: true });
  }
  if (ops.items.length > 0) groups.push(ops);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/admin" className={styles.brand}>
          <Logo variant="mark" height={22} />
          <span className={styles.env}>Admin</span>
        </Link>

        <AdminNav groups={groups} />

        <div className={styles.sidebarFoot}>
          <span className={styles.who}>
            <span className={styles.whoName}>{actor.role}</span>
            signed in
          </span>
          <form action={signOut}>
            <button type="submit" className={styles.signout}>
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main id="main-content" tabIndex={-1} className={styles.main}>{children}</main>
    </div>
  );
}
