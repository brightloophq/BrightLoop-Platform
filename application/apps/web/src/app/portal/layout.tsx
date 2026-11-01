import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireSurface } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { type PortalNavItem } from "./PortalNav";
import { PortalShell } from "./PortalShell";
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
/**
 * Never indexable.
 *
 * This surface used to inherit `noindex` from the root layout's site-wide rule.
 * That rule is gone now the public site is indexable, so the guard is declared
 * where it belongs — on the surface it protects. It is a crawler hint, not
 * access control: middleware, `requireSurface()` and RLS are what actually keep
 * this private.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

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
    { label: "Dashboard", href: "/portal", ready: true },
    { label: "Project", href: "/portal/project", ready: true },
    {
      label: "Deliverables",
      href: "/portal/deliverables",
      ready: true,
      badge: awaiting || undefined,
    },
    { label: "Proposals", href: "/portal/proposals", ready: true },
    { label: "Contracts", href: "/portal/contracts", ready: true },
    { label: "Invoices", href: "/portal/invoices", ready: true },
    {
      label: "Notifications",
      href: "/portal/notifications",
      ready: true,
      badge: unread || undefined,
    },
    { label: "Discovery chat", href: "/portal/chat", ready: true },
    { label: "Files", href: "/portal/files", ready: false },
    { label: "Meetings", href: "/portal/meetings", ready: false },
    { label: "Settings", href: "/portal/settings", ready: false },
  ];

  return (
    <div className={styles.shell}>
      <PortalShell items={items} roleLabel={actor.role.replace("_", " ")} />
      <main id="main-content" tabIndex={-1} className={styles.main}>{children}</main>
    </div>
  );
}
