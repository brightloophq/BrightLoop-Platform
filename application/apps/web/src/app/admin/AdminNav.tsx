"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@brightloop/ui";
import styles from "./admin.module.css";

export interface AdminNavItem {
  label: string;
  href: string;
  icon: string;
  /** Route exists and is built. Unbuilt modules render inert with a "soon" tag. */
  ready: boolean;
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

/**
 * Admin sidebar nav (handoff §08 — grouped Overview · Sales · Delivery · Finance
 * · Marketing · Ops).
 *
 * The groups are the approved information architecture, so they're shown in full
 * rather than trimmed and re-expanded each sprint. Modules that don't exist yet
 * render inert with a "soon" tag instead of linking to a 404 — the shape of the
 * product is visible, but nothing lies about being clickable.
 *
 * Which groups appear at all is decided SERVER-SIDE by capability (see layout);
 * this component only renders what it's handed.
 */
export function AdminNav({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <nav className={styles.nav} aria-label="Admin">
      {groups.map((group) => (
        <div key={group.label} className={styles.group}>
          <span className={styles.groupLabel}>{group.label}</span>
          {group.items.map((item) =>
            item.ready ? (
              <Link
                key={item.href}
                href={item.href}
                className={[styles.link, isActive(item.href) ? styles.linkActive : null]
                  .filter(Boolean)
                  .join(" ")}
                aria-current={isActive(item.href) ? "page" : undefined}
              >
                <Icon name={item.icon} size={16} />
                <span className={styles.linkLabel}>{item.label}</span>
              </Link>
            ) : (
              <span
                key={item.href}
                className={[styles.link, styles.linkSoon].join(" ")}
                aria-disabled="true"
                title={`${item.label} — not built yet`}
              >
                <Icon name={item.icon} size={16} />
                <span className={styles.linkLabel}>{item.label}</span>
                <span className={styles.soonTag}>soon</span>
              </span>
            ),
          )}
        </div>
      ))}
    </nav>
  );
}
