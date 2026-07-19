"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@brightloop/ui";
import {
  insightsHref,
  INSIGHT_STATUS_FILTERS,
  INSIGHT_SORTS,
  insightStatusFilterLabel,
  insightSortLabel,
  type InsightListQuery,
  type InsightActiveFilter,
} from "@brightloop/domain";
import styles from "./insights.module.css";

interface Org {
  id: string;
  name: string;
}

/**
 * URL-driven filter/search/sort controls. All state lives in the URL — Back/
 * Forward work and links are shareable. Search is debounced; every other change
 * navigates immediately. The server re-renders results (no dataset in the browser).
 */
export function InsightsControls({
  query,
  orgs,
  activeFilters,
}: {
  query: InsightListQuery;
  orgs: Org[];
  activeFilters: InsightActiveFilter[];
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
      router.push(insightsHref({ ...query, search: term, page: 1 }), { scroll: false });
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [term, query, router]);

  const go = (next: InsightListQuery) => router.push(insightsHref(next), { scroll: false });

  return (
    <>
      <div className={styles.controlRow}>
        <div className={styles.searchWrap}>
          <Icon name="search" size={16} className={styles.searchIcon} />
          <input
            type="search"
            className={styles.search}
            placeholder="Search insights…"
            aria-label="Search insights"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>

        <label className={styles.selectLabel}>
          <span className="sr-only">Filter by status</span>
          <select
            className={styles.select}
            value={query.status}
            onChange={(e) => go({ ...query, status: e.target.value as InsightListQuery["status"], page: 1 })}
          >
            {INSIGHT_STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {insightStatusFilterLabel(s)}
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
            onChange={(e) => go({ ...query, sort: e.target.value as InsightListQuery["sort"], page: 1 })}
          >
            {INSIGHT_SORTS.map((s) => (
              <option key={s} value={s}>
                {insightSortLabel(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {activeFilters.length > 0 ? (
        <>
          {activeFilters.map((f) => (
            <Link key={f.key} href={insightsHref(f.clearedQuery)} className={styles.chip} scroll={false}>
              {f.label}
              <Icon name="x" size={13} />
            </Link>
          ))}
          <Link href={`${pathname}`} className={styles.clearAll} scroll={false}>
            Clear all
          </Link>
        </>
      ) : null}
    </>
  );
}
