"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  FACET_LABELS,
  FACET_ORDER,
  type FacetCounts,
  type SortOrder,
} from "@brightloop/domain";
import type { FacetName } from "@brightloop/schema";
import { Button, Drawer } from "@brightloop/ui";
import {
  clearAllFilters,
  portfolioHref,
  toggleFacetValue,
  type PortfolioUrlState,
} from "@/lib/portfolio-params";
import styles from "./portfolio.module.css";

interface Props {
  state: PortfolioUrlState;
  counts: FacetCounts;
  total: number;
  /**
   * The results grid — rendered on the SERVER and passed through as children.
   * Keeping it a server component means the project list is never shipped to the
   * browser, so the publish gate stays a server-side guarantee.
   */
  children: ReactNode;
}

const SORT_LABELS: Record<SortOrder, string> = {
  featured: "Featured first",
  recent: "Most recent",
  az: "A–Z",
};

/** Facet groups open by default — the two people actually filter by. */
const DEFAULT_OPEN: readonly FacetName[] = ["industry", "service"];

/**
 * Work controls — search, sort, active-filter chips, and the facet drawer.
 *
 * All state lives in the URL: every interaction pushes a new URL and the SERVER
 * re-renders the results. There is no client-side copy of the project list, so
 * the publish gate is applied server-side on every single request — a filter can
 * never surface something the server didn't send.
 *
 * The facets live in the DRAWER AT EVERY WIDTH. They used to also occupy a 260px
 * sticky rail on desktop, which cost the work itself a fifth of the page for a
 * control most visitors never touch on a six-project index. Nothing was removed:
 * the same rail renders inside the drawer, one button away.
 */
export function PortfolioControls({ state, counts, total, children }: Props) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(state.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the input in sync when the URL changes underneath us (back button).
  useEffect(() => setSearchValue(state.search), [state.search]);

  const go = useCallback(
    (next: PortfolioUrlState) => router.push(portfolioHref(next), { scroll: false }),
    [router],
  );

  /** Debounce search ~200ms (handoff §10.2) so we don't push per keystroke. */
  const onSearchChange = (value: string) => {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      go({ ...state, search: value, page: 1 });
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const onToggle = (facet: FacetName, value: string) => go(toggleFacetValue(state, facet, value));

  const chips = FACET_ORDER.flatMap((facet) =>
    (state.filters[facet] ?? []).map((value) => ({ facet, value: String(value) })),
  );
  const hasFilters = chips.length > 0 || state.search.length > 0;

  const rail = <FacetRail state={state} counts={counts} onToggle={onToggle} />;

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <input
            type="search"
            className={styles.search}
            placeholder="Search by business, industry, service or keyword"
            aria-label="Search projects"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <select
          id="sort"
          className={styles.select}
          value={state.sort}
          onChange={(e) => go({ ...state, sort: e.target.value as SortOrder, page: 1 })}
          aria-label="Sort projects"
        >
          {(Object.keys(SORT_LABELS) as SortOrder[]).map((order) => (
            <option key={order} value={order}>
              {SORT_LABELS[order]}
            </option>
          ))}
        </select>

        <span className={styles.filterBtn}>
          <Button
            variant="secondary"
            size="md"
            onClick={() => setDrawerOpen(true)}
          >
            Filters{chips.length > 0 ? ` (${chips.length})` : ""}
          </Button>
        </span>
      </div>

      <div className={styles.status}>
        <div className={styles.chips}>
          {chips.map(({ facet, value }) => (
            <button
              key={`${facet}:${value}`}
              type="button"
              className={styles.chip}
              onClick={() => onToggle(facet, value)}
              aria-label={`Remove filter ${FACET_LABELS[facet]}: ${value}`}
            >
              <span className={styles.chipFacet}>{FACET_LABELS[facet]}:</span>
              {value}
            </button>
          ))}
          {hasFilters ? (
            <button type="button" className={styles.clearAll} onClick={() => go(clearAllFilters(state))}>
              Clear all
            </button>
          ) : null}
        </div>

        <p className={styles.count} aria-live="polite">
          {total} {total === 1 ? "project" : "projects"}
        </p>
      </div>

      {/* Server-rendered results grid — full measure, no rail beside it. */}
      {children}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Filters"
        footer={
          <Button variant="primary" size="md" block onClick={() => setDrawerOpen(false)}>
            Show {total} {total === 1 ? "project" : "projects"}
          </Button>
        }
      >
        {rail}
      </Drawer>
    </>
  );
}

function FacetRail({
  state,
  counts,
  onToggle,
}: {
  state: PortfolioUrlState;
  counts: FacetCounts;
  onToggle: (facet: FacetName, value: string) => void;
}) {
  const [open, setOpen] = useState<FacetName[]>([...DEFAULT_OPEN]);

  const toggleGroup = (facet: FacetName) =>
    setOpen((cur) => (cur.includes(facet) ? cur.filter((f) => f !== facet) : [...cur, facet]));

  return (
    <div>
      {FACET_ORDER.map((facet) => {
        const isOpen = open.includes(facet);
        const options = counts[facet];
        const selected = (state.filters[facet] ?? []).map(String);

        return (
          <div key={facet} className={styles.group}>
            <button
              type="button"
              className={styles.groupTrigger}
              aria-expanded={isOpen}
              onClick={() => toggleGroup(facet)}
            >
              {FACET_LABELS[facet]}
            </button>

            {isOpen ? (
              <div className={styles.options}>
                {options.map(({ value, count }) => {
                  const checked = selected.includes(value);
                  // A 0-count option that isn't already selected would return
                  // nothing — keep it visible but inert rather than hiding it,
                  // so the vocabulary stays stable as you filter.
                  const disabled = count === 0 && !checked;
                  return (
                    <label
                      key={value}
                      className={[styles.option, disabled ? styles.optionDisabled : null]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={checked}
                        disabled={disabled}
                        onChange={() => onToggle(facet, value)}
                      />
                      <span className={styles.optionLabel}>{value}</span>
                      <span className={styles.optionCount}>{count}</span>
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
