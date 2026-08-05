"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, Logo, ThemeToggle } from "@brightloop/ui";
import { useDrawerSlide } from "@brightloop/ui/motion";
import { signOut } from "../(auth)/actions";
import { PortalNav, type PortalNavItem } from "./PortalNav";
import styles from "../admin/admin.module.css";

/**
 * Client-portal shell.
 *
 * Desktop: a persistent, sticky rail. Mobile: an off-canvas drawer opened from a
 * fixed top bar, with a scrim, Escape-to-close, focus move-in/return, and
 * close-on-navigate — the same mechanism (and CSS) as the admin shell, so a portal
 * client on a phone can actually reach navigation instead of a sidebar slid
 * permanently off-canvas. The drawer slide is the one GSAP-driven piece (transform
 * + opacity only); it snaps instantly under prefers-reduced-motion.
 */
export function PortalShell({
  items,
  roleLabel,
}: {
  items: PortalNavItem[];
  roleLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useDrawerSlide(open, drawerRef, scrimRef);

  // Close the drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  // Escape-to-close + focus management while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const firstLink = drawerRef.current?.querySelector<HTMLElement>("a, button");
    firstLink?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      openerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      {/* Mobile-only top bar */}
      <header className={styles.mobileBar}>
        <button
          ref={openerRef}
          type="button"
          className={styles.iconBtn}
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls="portal-nav"
          onClick={() => setOpen(true)}
        >
          <Icon name="menu" size={20} />
        </button>
        <Link href="/portal" className={styles.brand}>
          <Logo variant="mark" height={20} />
          <span className={styles.env}>Portal</span>
        </Link>
        <span className={styles.mobileBarSpacer} />
        <ThemeToggle variant="compact" />
      </header>

      {/* Scrim (mobile drawer backdrop) */}
      <div
        ref={scrimRef}
        className={styles.scrim}
        onClick={() => setOpen(false)}
        aria-hidden="true"
        data-open={open ? "true" : "false"}
      />

      <aside
        id="portal-nav"
        ref={drawerRef}
        className={styles.sidebar}
        aria-label="Portal navigation"
        data-open={open ? "true" : "false"}
      >
        <div className={styles.sidebarHead}>
          <Link href="/portal" className={styles.brand}>
            <Logo variant="mark" height={22} />
            <span className={styles.env}>Portal</span>
          </Link>
          <button
            type="button"
            className={[styles.iconBtn, styles.closeBtn].join(" ")}
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <PortalNav items={items} />

        <div className={styles.sidebarFoot}>
          <div className={styles.appearanceRow}>
            <span className={styles.appearanceLabel}>Appearance</span>
            <ThemeToggle />
          </div>
          <span className={styles.who}>
            <span className={styles.whoName}>{roleLabel}</span>
            signed in
          </span>
          <form action={signOut}>
            <button type="submit" className={styles.signout}>
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
