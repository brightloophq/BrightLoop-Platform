import type { ReactNode } from "react";
import Link from "next/link";
import { Logo, ThemeToggle } from "@brightloop/ui";
import { requireSurface } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../(auth)/actions";
import { PortalNav, type PortalNavItem } from "./PortalNav";
import styles from "../admin/admin.module.css";

/**
 * Client portal layout (handoff §07).
 *
 * requireSurface("portal") admits only client_admin / client_member. Everything
 * below is RLS-scoped to the caller's own client org — a portal user physically
 * cannot load another organisation's data.
 *
 * The nav shows an "actions awaiting you" count on Deliverables, computed from
 * the client's own in_review deliverables — the re-entry driver from §07.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const actor = await requireSurface("portal");
  const supabase = await createClient();

  // Count deliverables awaiting this client's decision. RLS scopes it to their
  // org, so no filter by client_id is needed — the DB does it.
  const { count: awaitingDeliverables } = await supabase
    .from("deliverables")
    .select("id", { count: "exact", head: true })
    .eq("status", "in_review");

  const { count: awaitingMilestones } = await supabase
    .from("milestones")
    .select("id", { count: "exact", head: true })
    .eq("status", "waiting_client_approval");

  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("read", false);

  const awaiting = (awaitingDeliverables ?? 0) + (awaitingMilestones ?? 0);

  const items: PortalNavItem[] = [
    { label: "Dashboard", href: "/portal", icon: "layout-grid", ready: true },
    { label: "Project", href: "/portal/project", icon: "workflow", ready: true },
    {
      label: "Deliverables",
      href: "/portal/deliverables",
      icon: "check",
      ready: true,
      badge: awaiting || undefined,
    },
    { label: "Proposals", href: "/portal/proposals", icon: "search", ready: true },
    { label: "Contracts", href: "/portal/contracts", icon: "check-circle", ready: true },
    { label: "Invoices", href: "/portal/invoices", icon: "trending-up", ready: true },
    {
      label: "Notifications",
      href: "/portal/notifications",
      icon: "heart",
      ready: true,
      badge: unread || undefined,
    },
    { label: "Discovery chat", href: "/portal/chat", icon: "mail", ready: true },
    { label: "Files", href: "/portal/files", icon: "layout-grid", ready: false },
    { label: "Meetings", href: "/portal/meetings", icon: "clock", ready: false },
    { label: "Settings", href: "/portal/settings", icon: "route", ready: false },
  ];

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/portal" className={styles.brand}>
          <Logo variant="mark" height={22} />
          <span className={styles.env}>Portal</span>
        </Link>

        <PortalNav items={items} />

        <div className={styles.sidebarFoot}>
          <div className={styles.appearanceRow}>
            <span className={styles.appearanceLabel}>Appearance</span>
            <ThemeToggle />
          </div>
          <span className={styles.who}>
            <span className={styles.whoName}>{actor.role.replace("_", " ")}</span>
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
