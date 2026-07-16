/* =============================================================================
 * Facet counts for the portfolio filter rail (handoff §05: "collapsible facet
 * groups with counts").
 *
 * Counts are computed per-facet against every OTHER active filter, not against
 * the fully-filtered set. That is what makes them meaningful: the number beside
 * "Hospitality" answers "how many results would I get if I ticked this?", so it
 * never shows 0 next to an option that would actually return matches, and never
 * shows a stale total that ignores your other choices.
 *
 * Values come from the controlled vocabulary in FACETS (the prototype's
 * approach), so a facet group's options stay stable even when a filter
 * combination happens to return nothing.
 *
 * Publish-gated throughout — counts are computed over published projects only,
 * so a facet count can never reveal the existence of a private project.
 * ========================================================================== */

import { FACETS, type FacetName, type PortfolioProject } from "@brightloop/schema";
import { publicProjects, type PortfolioFilters } from "./query.js";

export interface FacetOption {
  value: string;
  count: number;
}

export type FacetCounts = Record<FacetName, FacetOption[]>;

/** Pull the comparable value(s) for a facet off a project. */
function valuesFor(project: PortfolioProject, facet: FacetName): string[] {
  switch (facet) {
    case "industry":
      return [project.industry];
    case "size":
      return [project.size];
    case "service":
      return project.services;
    case "country":
      return [project.country];
    case "year":
      return [String(project.year)];
    case "budget":
      return [project.budget];
    case "tech":
      return project.tech;
    default:
      return [];
  }
}

function matchesFacet(
  project: PortfolioProject,
  facet: FacetName,
  selected: readonly (string | number)[],
): boolean {
  if (selected.length === 0) return true;
  const wanted = selected.map(String);
  return valuesFor(project, facet).some((v) => wanted.includes(v));
}

function matchesSearch(project: PortfolioProject, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [
    project.name,
    project.client,
    project.industry,
    project.summary,
    ...project.services,
    ...project.tags,
    ...project.tech,
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

const FACET_NAMES = Object.keys(FACETS) as FacetName[];

/**
 * Count how many published projects each facet value would match, given the
 * search term and every filter EXCEPT the facet being counted.
 */
export function facetCounts(
  projects: readonly PortfolioProject[],
  filters: PortfolioFilters = {},
  search = "",
): FacetCounts {
  const gated = publicProjects(projects).filter((p) => matchesSearch(p, search));
  const out = {} as FacetCounts;

  for (const facet of FACET_NAMES) {
    // Apply all OTHER facets' filters, leaving this one open.
    const pool = gated.filter((project) =>
      FACET_NAMES.every((other) => {
        if (other === facet) return true;
        return matchesFacet(project, other, filters[other] ?? []);
      }),
    );

    out[facet] = (FACETS[facet] as readonly (string | number)[]).map((value) => ({
      value: String(value),
      count: pool.filter((project) => valuesFor(project, facet).includes(String(value))).length,
    }));
  }

  return out;
}

/** Flatten active filters into removable chips for the UI. */
export interface ActiveFilterChip {
  facet: FacetName;
  value: string;
}

export function activeFilterChips(filters: PortfolioFilters): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  for (const facet of FACET_NAMES) {
    for (const value of filters[facet] ?? []) {
      chips.push({ facet, value: String(value) });
    }
  }
  return chips;
}

/** Human label for a facet group. */
export const FACET_LABELS: Record<FacetName, string> = {
  industry: "Industry",
  service: "Service",
  size: "Business size",
  country: "Country",
  year: "Completion year",
  budget: "Budget range",
  tech: "Technology",
};

/** Display order of the facet groups in the rail (handoff §05). */
export const FACET_ORDER: readonly FacetName[] = [
  "industry",
  "service",
  "size",
  "country",
  "year",
  "budget",
  "tech",
];
