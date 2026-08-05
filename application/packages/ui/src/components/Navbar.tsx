"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "./Button";
import { Container } from "./Container";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { ThemeToggle } from "../theme/ThemeToggle";
import styles from "./Navbar.module.css";

export interface MegaMenuItem {
  label: string;
  description: string;
  href: string;
  icon: string;
}

export interface NavLink {
  label: string;
  href: string;
  /** When present, this link opens the mega-menu instead of navigating. */
  mega?: readonly MegaMenuItem[];
}

export interface NavbarProps {
  links: readonly NavLink[];
  ctaLabel: string;
  ctaHref: string;
  /** Current pathname, for aria-current. */
  pathname?: string;
}

/**
 * Navbar — sticky glass header with the Services mega-menu (handoff §01.4).
 *
 * Behaviour:
 *  * transparent over the hero; on scroll >8px gains the navy glass + hairline;
 *  * mega-menu opens on hover (pointer) and on click/tap (touch + keyboard);
 *  * <1024px collapses to a hamburger → slide-in drawer that traps focus,
 *    closes on Escape and scrim click, and restores focus to its trigger.
 */
export function Navbar({ links, ctaLabel, ctaHref, pathname }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [openMega, setOpenMega] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const megaCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const megaId = useId();

  /* ---- sticky glass on scroll ---- */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ---- mega-menu hover intent (a small delay stops flicker between targets) ---- */
  const cancelClose = useCallback(() => {
    if (megaCloseTimer.current) {
      clearTimeout(megaCloseTimer.current);
      megaCloseTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    megaCloseTimer.current = setTimeout(() => setOpenMega(null), 120);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  /* ---- Escape closes whatever is open ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (drawerOpen) {
        setDrawerOpen(false);
        burgerRef.current?.focus();
      }
      setOpenMega(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  /* ---- drawer: lock scroll, focus first item, trap Tab ---- */
  useEffect(() => {
    if (!drawerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const node = drawerRef.current;
    const focusables = node?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusables?.[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !node) return;
      const items = node.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    node?.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      node?.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    burgerRef.current?.focus();
  }, []);

  const isCurrent = (href: string) =>
    pathname === href || (href !== "/" && pathname?.startsWith(href));

  return (
    <>
      <header className={[styles.header, scrolled ? styles.scrolled : null].filter(Boolean).join(" ")}>
        <Container width="wide" className={styles.inner}>
          <Link href="/" className={styles.brand} aria-label="Auxion — home">
            <Logo variant="lockup" height={26} />
          </Link>

          <nav className={styles.nav} aria-label="Primary">
            {links.map((link) =>
              link.mega ? (
                <div
                  key={link.label}
                  className={styles.megaWrap}
                  onMouseEnter={() => {
                    cancelClose();
                    setOpenMega(link.label);
                  }}
                  onMouseLeave={scheduleClose}
                >
                  <button
                    type="button"
                    className={styles.link}
                    aria-expanded={openMega === link.label}
                    aria-controls={`${megaId}-${link.label}`}
                    onClick={() => setOpenMega((v) => (v === link.label ? null : link.label))}
                  >
                    {link.label}
                    <Icon
                      name="chevron-down"
                      size={14}
                      className={[styles.chevron, openMega === link.label ? styles.chevronOpen : null]
                        .filter(Boolean)
                        .join(" ")}
                    />
                  </button>

                  {openMega === link.label ? (
                    <div id={`${megaId}-${link.label}`} className={styles.mega}>
                      <div className={styles.megaGrid}>
                        {link.mega.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={styles.megaItem}
                            onClick={() => setOpenMega(null)}
                          >
                            <span className={styles.megaIcon}>
                              <Icon name={item.icon} size={18} />
                            </span>
                            <span>
                              <span className={styles.megaLabel}>{item.label}</span>
                              <span className={styles.megaDesc}>{item.description}</span>
                            </span>
                          </Link>
                        ))}
                      </div>
                      <div className={styles.megaFoot}>
                        <Link href={link.href} className={styles.link} onClick={() => setOpenMega(null)}>
                          All services
                          <Icon name="arrow-right" size={14} />
                        </Link>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className={styles.link}
                  aria-current={isCurrent(link.href) ? "page" : undefined}
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>

          <div className={styles.actions}>
            <span className={styles.desktopTheme}>
              <ThemeToggle variant="compact" label="Theme" />
            </span>
            <span className={styles.desktopCta}>
              <Button variant="primary" size="sm" asChild>
                <Link href={ctaHref}>{ctaLabel}</Link>
              </Button>
            </span>
            <button
              ref={burgerRef}
              type="button"
              className={styles.burger}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <Icon name="menu" size={20} />
            </button>
          </div>
        </Container>
      </header>

      {drawerOpen ? (
        <>
          <button className={styles.scrim} aria-label="Close menu" onClick={closeDrawer} />
          <div
            ref={drawerRef}
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div className={styles.drawerHead}>
              <Logo variant="lockup" height={24} />
              <button
                type="button"
                className={styles.burger}
                aria-label="Close menu"
                onClick={closeDrawer}
              >
                <Icon name="x" size={20} />
              </button>
            </div>

            <nav className={styles.drawerNav} aria-label="Mobile">
              {links.map((link) => (
                <div key={link.label}>
                  <Link href={link.href} className={styles.drawerLink} onClick={closeDrawer}>
                    {link.label}
                  </Link>
                  {link.mega ? (
                    <div className={styles.drawerGroup}>
                      <span className={styles.drawerGroupLabel}>{link.label}</span>
                      {link.mega.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={styles.drawerLink}
                          onClick={closeDrawer}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </nav>

            <div className={styles.drawerTheme}>
              <span className={styles.drawerGroupLabel}>Appearance</span>
              <ThemeToggle variant="segmented" label="Theme" />
            </div>

            <Button variant="primary" size="md" block asChild>
              <Link href={ctaHref} onClick={closeDrawer}>
                {ctaLabel}
              </Link>
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}
