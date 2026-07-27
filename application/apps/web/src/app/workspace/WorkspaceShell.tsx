"use client";

/**
 * Workspace Experience shell (Phase F · Sprint F1) — the premium client SaaS
 * chrome: sidebar, topbar, breadcrumbs, command palette (⌘K), notification
 * center, and responsive mobile drawer. All navigation/filtering logic lives in
 * the tested pure helpers (`lib/workspace/*`); this component only wires state to
 * markup. Authorization + data are handled by the server layout/pages — the shell
 * is presentational.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon, Logo } from "@brightloop/ui";
import { WORKSPACE_NAV, activeNavKey, breadcrumbs } from "@/lib/workspace/nav";
import { filterCommands } from "@/lib/workspace/command-palette";
import type { WorkspaceNotification } from "@/lib/workspace/notifications";
import type { WorkspaceRef } from "@/lib/workspace-data";
import styles from "./workspace.module.css";

interface Props {
  workspaces: WorkspaceRef[];
  notifications: WorkspaceNotification[];
  approvalsCount: number;
  children: React.ReactNode;
}

export function WorkspaceShell({ workspaces, notifications, approvalsCount, children }: Props) {
  const pathname = usePathname() ?? "/workspace";
  const router = useRouter();
  const active = activeNavKey(pathname);
  const crumbs = breadcrumbs(pathname);
  const [drawer, setDrawer] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const results = useMemo(() => filterCommands(query), [query]);
  const badges: Record<string, number> = { approvals: approvalsCount, notifications: notifications.length };

  const closePalette = useCallback(() => { setPaletteOpen(false); setQuery(""); setCursor(0); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((v) => !v); setNotifOpen(false); }
      else if (e.key === "Escape") { closePalette(); setNotifOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePalette]);

  useEffect(() => { setDrawer(false); setNotifOpen(false); closePalette(); }, [pathname, closePalette]);

  const go = (href: string) => { closePalette(); router.push(href); };
  const onPaletteKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter" && results[cursor]) { e.preventDefault(); go(results[cursor]!.href); }
  };

  let lastGroup = "";

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} data-open={drawer} aria-label="Workspace navigation">
        <div className={styles.brand}><Logo variant="mark" /><strong style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-lg)" }}>Auxion</strong></div>
        <div className={styles.workspacePicker}>
          <span className={styles.wsLabel}>Workspace</span>
          <span className={styles.wsName}>{workspaces[0]?.title ?? "Your workspace"}</span>
        </div>
        <nav className={styles.nav}>
          {WORKSPACE_NAV.map((item) => {
            const count = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
            return (
              <Link key={item.key} href={item.href} className={styles.navItem} data-active={active === item.key} aria-current={active === item.key ? "page" : undefined}>
                <span className={styles.navIcon}><Icon name={item.icon} size={16} /></span>
                <span className={styles.navLabel}>{item.label}</span>
                {count > 0 && <span className={styles.navBadge}>{count}</span>}
              </Link>
            );
          })}
        </nav>
        <div className={styles.sidebarFoot}>
          <button className={styles.topAction} onClick={() => setPaletteOpen(true)}><Icon name="search" size={14} /> Command<kbd>⌘K</kbd></button>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button className={`${styles.iconBtn} ${styles.menuBtn}`} aria-label="Open navigation" onClick={() => setDrawer((v) => !v)}><Icon name="menu" size={18} /></button>
          <nav className={styles.crumbs} aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.href} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0 }}>
                {i > 0 && <span className={styles.crumbSep}><Icon name="chevron-right" size={14} /></span>}
                {i === crumbs.length - 1 ? <span className={styles.crumbCurrent}>{c.label}</span> : <Link href={c.href}>{c.label}</Link>}
              </span>
            ))}
          </nav>
          <span className={styles.topSpacer} />
          <button className={styles.topAction} onClick={() => setPaletteOpen(true)} aria-label="Search and commands"><Icon name="search" size={14} /> Search<kbd>⌘K</kbd></button>
          <button className={styles.iconBtn} aria-label={`Notifications (${notifications.length})`} onClick={() => setNotifOpen((v) => !v)}>
            <Icon name="bell" size={18} />{notifications.length > 0 && <span className={styles.dot} />}
          </button>
        </header>

        <main className={styles.content}>{children}</main>
      </div>

      {paletteOpen && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Command palette" onClick={closePalette}>
          <div className={styles.palette} onClick={(e) => e.stopPropagation()}>
            <input autoFocus className={styles.paletteInput} placeholder="Search or run a command…" value={query} onChange={(e) => { setQuery(e.target.value); setCursor(0); }} onKeyDown={onPaletteKey} aria-label="Command query" />
            <div className={styles.paletteList}>
              {results.length === 0 && <div className={styles.paletteGroup}>No matches</div>}
              {results.map((cmd, i) => {
                const header = cmd.group !== lastGroup ? cmd.group : null; lastGroup = cmd.group;
                return (
                  <div key={cmd.id}>
                    {header && <div className={styles.paletteGroup}>{header}</div>}
                    <a className={styles.paletteItem} data-active={i === cursor} onMouseEnter={() => setCursor(i)} onClick={() => go(cmd.href)}>
                      {cmd.label}<span className={styles.paletteHint}>{cmd.hint}</span>
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {notifOpen && (
        <div className={styles.notifPanel} role="dialog" aria-label="Notifications">
          <div className={styles.notifHead}>Notifications<span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontWeight: 400 }}>{notifications.length}</span></div>
          <div className={styles.notifList}>
            {notifications.length === 0 && <div className={styles.notifRow}><div><div className={styles.notifTitle}>You’re all caught up</div><div className={styles.notifDetail}>New activity will appear here.</div></div></div>}
            {notifications.slice(0, 40).map((n) => (
              <Link key={n.id} href={n.href} className={styles.notifRow}>
                <span className={styles.notifStripe} data-sev={n.severity} />
                <span><span className={styles.notifTitle}>{n.title}</span><br /><span className={styles.notifDetail}>{n.detail}</span></span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
