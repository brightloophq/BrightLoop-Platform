"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@brightloop/ui";
import styles from "../admin/admin.module.css";

export interface PortalNavItem {
  label: string;
  href: string;
  icon: string;
  ready: boolean;
  /** Count badge (e.g. actions awaiting the client). */
  badge?: number;
}

export function PortalNav({ items }: { items: PortalNavItem[] }) {
  const pathname = usePathname();
  // Exact match or a true path-segment prefix (href + "/") — never a bare
  // startsWith, so a parent link can't stay lit on an unrelated sibling route.
  const isActive = (href: string) =>
    href === "/portal"
      ? pathname === "/portal"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className={styles.nav} aria-label="Portal">
      <div className={styles.group}>
        {items.map((item) =>
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
              {item.badge ? (
                <span className={styles.soonTag} style={{ color: "var(--text-accent)", fontWeight: 700 }}>
                  {item.badge}
                </span>
              ) : null}
            </Link>
          ) : (
            <span
              key={item.href}
              className={[styles.link, styles.linkSoon].join(" ")}
              aria-disabled="true"
              title={`${item.label} — coming soon`}
            >
              <Icon name={item.icon} size={16} />
              <span className={styles.linkLabel}>{item.label}</span>
              <span className={styles.soonTag}>soon</span>
            </span>
          ),
        )}
      </div>
    </nav>
  );
}
