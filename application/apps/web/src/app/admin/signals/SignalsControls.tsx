"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@brightloop/ui";
import {
  signalsHref,
  SIGNAL_STATUS_FILTERS,
  SIGNAL_SORTS,
  signalStatusFilterLabel,
  signalSortLabel,
  type SignalListQuery,
  type ActiveFilter,
} from "@brightloop/domain";
import styles from "./signals.module.css";

interface Org {
  id: string;
  name: string;
}

/**
 * URL-driven filter/search/sort controls. All state lives in the URL — Back/
 * Forward work and links are shareable. Search is debounced; every other change
 * navigates immediately. The server re-renders results (no dataset in the browser).
 */
export function SignalsControls({
  query,
  orgs,
  activeFilters,
}: {
  query: SignalListQuery;
  orgs: Org[];
  activeFilters: ActiveFilter[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [term, setTerm] = useState(query.search);

  // Keep the input in sync when the URL changes elsewhere (chips, Back button).
  useEffect(() => setTerm(query.search), [query.search]);

  // Debounced search → URL.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (term === query.search) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      router.push(signalsHref({ ...query, search: term, page: 1 }), { scroll: false });
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [term, query, router]);

  const go = (next: SignalListQuery) => router.push(signalsHref(next), { scroll: false });

  return (
    <>
      <div className={styles.controlRow}>
        <div className={styles.searchWrap}>
          <Icon name="search" size={16} className={styles.searchIcon} />
          <input
            type="search"
            className={styles.search}
            placeholder="Search signals…"
            aria-label="Search signals"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>

        <label className={styles.selectLabel}>
          <span className="sr-only">Filter by status</span>
          <select
            className={styles.select}
            value={query.status}
            onChange={(e) => go({ ...query, status: e.target.value as SignalListQuery["status"], page: 1 })}
          >
            {SIGNAL_STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {signalStatusFilterLabel(s)}
              </option>
            ))}
          </select>
        </label>

        {orgs.length > 0 ? (
          <label className={styles.selectLabel}>
            <span className="sr-only">Filter by organization</span>
            <select
              className={styles.select}
              value={query.clientId ?? ""}
              onChange={(e) => go({ ...query, clientId: e.target.value || null, page: 1 })}
            >
              <option value="">All organizations</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className={styles.trailingRow}>
        <label className={styles.selectLabel}>
          <span className="sr-only">Sort</span>
          <select
            className={styles.select}
            value={query.sort}
            onChange={(e) => go({ ...query, sort: e.target.value as SignalListQuery["sort"], page: 1 })}
          >
            {SIGNAL_SORTS.map((s) => (
              <option key={s} value={s}>
                {signalSortLabel(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {activeFilters.length > 0 ? (
        <>
          {activeFilters.map((f) => (
            <Link key={f.key} href={signalsHref(f.clearedQuery)} className={styles.chip} scroll={false}>
              {f.label}
              <Icon name="x" size={13} />
            </Link>
          ))}
          <Link
            href={`${pathname}`}
            className={styles.clearAll}
            scroll={false}
          >
            Clear all
          </Link>
        </>
      ) : null}
    </>
  );
}
