import { FACETS, type FacetName } from "@brightloop/schema";
import type { PortfolioFilters, SortOrder } from "@brightloop/domain";

/**
 * Portfolio URL state ↔ query semantics.
 *
 * Filter/search/sort/page state lives in the URL, not React state. That makes
 * the portfolio server-rendered, deep-linkable, shareable, back-button correct
 * and crawlable — all of which the approved spec asks for (handoff §01.1
 * "deep-linkable", §10.4 SEO-friendly URLs).
 *
 * Format: ?industry=Agriculture,Hospitality&service=Brand&q=farm&sort=recent&page=2
 *
 * Values are validated against the controlled vocabulary in FACETS. Anything not
 * in the vocab is DISCARDED rather than passed to the query — a crafted URL
 * can't inject a filter value, and can't be used to probe for unpublished rows.
 */

export const SORT_ORDERS: readonly SortOrder[] = ["featured", "recent", "az"];
export const DEFAULT_SORT: SortOrder = "featured";
export const PER_PAGE = 9;

/** Next 15 passes searchParams as string | string[] | undefined. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

const FACET_NAMES = Object.keys(FACETS) as FacetName[];

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Parse + validate filters. Unknown facet values are dropped, not trusted. */
export function parseFilters(params: RawSearchParams): PortfolioFilters {
  const filters: PortfolioFilters = {};

  for (const facet of FACET_NAMES) {
    const raw = first(params[facet]);
    if (!raw) continue;

    const vocab = (FACETS[facet] as readonly (string | number)[]).map(String);
    const values = raw
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && vocab.includes(v));

    // De-duplicate: ?industry=Agriculture,Agriculture must not double-filter.
    const unique = [...new Set(values)];
    if (unique.length > 0) filters[facet] = unique;
  }

  return filters;
}

export function parseSearch(params: RawSearchParams): string {
  // Cap length — the haystack search is a substring scan, not a query language.
  return first(params["q"]).slice(0, 100);
}

export function parseSort(params: RawSearchParams): SortOrder {
  const raw = first(params["sort"]) as SortOrder;
  return SORT_ORDERS.includes(raw) ? raw : DEFAULT_SORT;
}

export function parsePage(params: RawSearchParams): number {
  const raw = Number.parseInt(first(params["page"]), 10);
  // paginate() clamps the upper bound; guard the lower bound and NaN here.
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

export interface PortfolioUrlState {
  filters: PortfolioFilters;
  search: string;
  sort: SortOrder;
  page: number;
}

export function parsePortfolioParams(params: RawSearchParams): PortfolioUrlState {
  return {
    filters: parseFilters(params),
    search: parseSearch(params),
    sort: parseSort(params),
    page: parsePage(params),
  };
}

/** Serialize state back to a query string. Defaults are omitted for clean URLs. */
export function buildPortfolioQuery(state: Partial<PortfolioUrlState>): string {
  const sp = new URLSearchParams();

  for (const facet of FACET_NAMES) {
    const values = state.filters?.[facet];
    if (values && values.length > 0) sp.set(facet, values.map(String).join(","));
  }

  if (state.search) sp.set("q", state.search);
  if (state.sort && state.sort !== DEFAULT_SORT) sp.set("sort", state.sort);
  if (state.page && state.page > 1) sp.set("page", String(state.page));

  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function portfolioHref(state: Partial<PortfolioUrlState>): string {
  return `/portfolio${buildPortfolioQuery(state)}`;
}

/**
 * Toggle one facet value on/off.
 * Selecting a filter resets to page 1 (handoff §10.2) — otherwise you can land
 * on page 3 of a 1-page result and see an empty grid.
 */
export function toggleFacetValue(
  state: PortfolioUrlState,
  facet: FacetName,
  value: string,
): PortfolioUrlState {
  const current = (state.filters[facet] ?? []).map(String);
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];

  const filters: PortfolioFilters = { ...state.filters };
  if (next.length > 0) filters[facet] = next;
  else delete filters[facet];

  return { ...state, filters, page: 1 };
}

export function clearAllFilters(state: PortfolioUrlState): PortfolioUrlState {
  return { ...state, filters: {}, search: "", page: 1 };
}
