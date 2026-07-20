/* =============================================================================
 * Identity validation & false-positive prevention (Sprint 10 §3/§15 · AIS-005 §06).
 *
 * The integrity gate. Deterministic rules reject duplicates, aliases, parents,
 * franchises, marketplaces, directories, suppliers, off-category matches, inactive
 * sites, evidence-less candidates, and regional mismatches.
 *
 * HARD RULE: an AMBIGUOUS candidate is never silently classified as a competitor —
 * it is marked `ambiguous` and routed to manual review (AIS-005 §06 Human review).
 * ========================================================================== */

import {
  identityValidationSchema,
  COMPETITOR_FORMULA_VERSION,
  type CompetitorDiscoveryInput,
  type EngineCompetitorCandidate,
  type IdentityDisposition,
  type IdentityFinding,
  type IdentityIssueKind,
  type IdentityValidation,
} from "@brightloop/schema";
import { domainRoot, normalizeBusinessName, normalizeDomain } from "./candidate.js";

/** Known aggregator/directory hosts — never direct competitors. Extend via policy. */
export const DEFAULT_DIRECTORY_DOMAINS = [
  "yelp.com", "yellowpages.com", "tripadvisor.com", "trustpilot.com", "glassdoor.com",
  "crunchbase.com", "linkedin.com", "facebook.com", "instagram.com", "x.com", "twitter.com",
  "google.com", "bing.com", "wikipedia.org", "indeed.com", "clutch.co", "g2.com", "capterra.com",
];
/** Marketplaces: a channel a business sells THROUGH, not a like-for-like rival. */
export const DEFAULT_MARKETPLACE_DOMAINS = ["amazon.com", "ebay.com", "etsy.com", "walmart.com", "alibaba.com", "shopify.com"];
/** Non-commercial TLDs/hosts. */
const NON_COMMERCIAL = /\.(gov|edu|mil)$/;

export interface IdentityPolicy {
  clientDomain: string;
  clientName?: string;
  /** Aliases of the client (same company under another name/domain). */
  clientAliases?: string[];
  directoryDomains?: string[];
  marketplaceDomains?: string[];
  supplierDomains?: string[];
  /** Geographies the client actually serves; a disjoint candidate is a regional mismatch. */
  clientGeography?: string[];
  clientIndustry?: string | null;
  minimumEvidenceCount?: number;
  /** Domains known to be inactive/unreachable (supplied; never probed — offline sprint). */
  inactiveDomains?: string[];
  discovery?: Pick<CompetitorDiscoveryInput, "excludedDomains">;
}

/** Rank of severity: reject beats exclude beats ambiguous beats flag_only. */
const DISPOSITION_RANK: Record<IdentityDisposition, number> = { reject: 0, exclude: 1, ambiguous: 2, flag_only: 3 };

function finding(kind: IdentityIssueKind, disposition: IdentityDisposition, detail: string, relatedCandidateIds: string[] = []): IdentityFinding {
  return { kind, disposition, detail, relatedCandidateIds, evidenceIds: [] };
}

/**
 * Validate one candidate against the whole pool + policy. Returns every finding and
 * the resulting status. Deterministic; findings are emitted in a fixed rule order.
 */
export function validateIdentity(
  candidate: EngineCompetitorCandidate,
  pool: readonly EngineCompetitorCandidate[],
  policy: IdentityPolicy,
): IdentityValidation {
  const findings: IdentityFinding[] = [];
  const nd = candidate.normalizedDomain;
  const root = domainRoot(nd);
  const clientDomain = normalizeDomain(policy.clientDomain);
  const directories = new Set((policy.directoryDomains ?? DEFAULT_DIRECTORY_DOMAINS).map(normalizeDomain));
  const marketplaces = new Set((policy.marketplaceDomains ?? DEFAULT_MARKETPLACE_DOMAINS).map(normalizeDomain));
  const suppliers = new Set((policy.supplierDomains ?? []).map(normalizeDomain));
  const inactive = new Set((policy.inactiveDomains ?? []).map(normalizeDomain));
  const aliases = new Set((policy.clientAliases ?? []).map(normalizeDomain));

  // 1 · the client itself, or a known alias of it
  if (nd === clientDomain || aliases.has(nd)) {
    findings.push(finding("same_company_alias", "reject", `'${nd}' is the client or a known client alias`));
  }

  // 2 · exact-domain duplicate of an earlier candidate in the pool
  const duplicates = pool.filter((c) => c.id !== candidate.id && c.normalizedDomain === nd && c.normalizedDomain !== "");
  if (duplicates.length > 0 && duplicates.some((d) => d.id < candidate.id)) {
    findings.push(finding("exact_domain_duplicate", "reject", `duplicate of ${duplicates.map((d) => d.id).sort()[0]}`, duplicates.map((d) => d.id).sort()));
  }

  // 3 · parent/subsidiary or franchise variant: same registrable root, different host
  const sameRoot = pool.filter((c) => c.id !== candidate.id && c.normalizedDomain !== nd && domainRoot(c.normalizedDomain) === root && root !== "");
  if (sameRoot.length > 0) {
    const franchise = /^(?:[a-z]{2}|[a-z-]*(?:city|store|branch|location)[a-z-]*)\./.test(nd);
    findings.push(
      franchise
        ? finding("franchise_variant", "exclude", `franchise/location variant of ${root}`, sameRoot.map((c) => c.id).sort())
        : finding("parent_subsidiary", "exclude", `shares registrable root '${root}' with another candidate`, sameRoot.map((c) => c.id).sort()),
    );
  }

  // 4 · directories, marketplaces, suppliers, non-commercial
  if (directories.has(nd) || directories.has(root)) findings.push(finding("directory_listing", "reject", `'${nd}' is a directory/aggregator, not a direct competitor`));
  if (marketplaces.has(nd) || marketplaces.has(root)) findings.push(finding("marketplace_not_competitor", "reject", `'${nd}' is a marketplace channel, not a direct competitor`));
  if (suppliers.has(nd) || suppliers.has(root)) findings.push(finding("supplier_not_competitor", "reject", `'${nd}' is a supplier, not a competitor`));
  if (NON_COMMERCIAL.test(nd)) findings.push(finding("non_commercial_entity", "reject", `'${nd}' is a non-commercial entity`));

  // 5 · explicitly excluded by discovery policy
  if (policy.discovery?.excludedDomains.map(normalizeDomain).includes(nd) === true) {
    findings.push(finding("similar_name_unrelated", "exclude", `'${nd}' is on the discovery exclusion list`));
  }

  // 6 · inactive / unreachable (supplied, never probed)
  if (inactive.has(nd)) findings.push(finding("inactive_business", "reject", `'${nd}' is recorded inactive/unreachable`));

  // 7 · similar name but unrelated domain → ambiguous, never an automatic competitor
  if (policy.clientName !== undefined) {
    const sameName = normalizeBusinessName(candidate.businessName) === normalizeBusinessName(policy.clientName);
    if (sameName && nd !== clientDomain) findings.push(finding("similar_name_unrelated", "ambiguous", "name matches the client but the domain differs"));
  }

  // 8 · category mismatch
  if (policy.clientIndustry != null && candidate.industry != null && candidate.industry !== policy.clientIndustry) {
    findings.push(finding("irrelevant_category", "ambiguous", `industry '${candidate.industry}' differs from client '${policy.clientIndustry}'`));
  }

  // 9 · regional mismatch: no geographic overlap at all
  const clientGeo = policy.clientGeography ?? [];
  if (clientGeo.length > 0 && candidate.geography.length > 0 && !candidate.geography.some((g) => clientGeo.includes(g))) {
    findings.push(finding("regional_mismatch", "ambiguous", "no geographic overlap with the client"));
  }

  // 10 · evidence floor — rule 1
  if (candidate.evidenceIds.length < Math.max(1, policy.minimumEvidenceCount ?? 1)) {
    findings.push(finding("missing_evidence", "ambiguous", "insufficient evidence to confirm identity"));
  }

  // 11 · inherently ambiguous identity
  if (nd === "") findings.push(finding("ambiguous_identity", "ambiguous", "no resolvable domain"));

  return identityValidationSchema.parse({
    candidateId: candidate.id,
    status: competitorStatusFor(findings),
    findings,
    manualReviewRequired: findings.some((f) => f.disposition === "ambiguous"),
    formulaVersion: COMPETITOR_FORMULA_VERSION,
  });
}

/** The status implied by the findings. Most severe disposition wins. Pure. */
export function competitorStatusFor(findings: readonly IdentityFinding[]): EngineCompetitorCandidate["status"] {
  if (findings.length === 0) return "validated";
  const worst = [...findings].sort((a, b) => DISPOSITION_RANK[a.disposition] - DISPOSITION_RANK[b.disposition])[0]!;
  if (worst.disposition === "reject") return "rejected";
  if (worst.disposition === "exclude") return "excluded";
  if (worst.disposition === "ambiguous") return "ambiguous"; // NEVER auto-promoted
  return "validated";
}

/** Apply a validation to its candidate, carrying reasons + the review flag. Pure. */
export function applyValidation(candidate: EngineCompetitorCandidate, validation: IdentityValidation): EngineCompetitorCandidate {
  return {
    ...candidate,
    status: validation.status,
    exclusionReasons: [...candidate.exclusionReasons, ...validation.findings.filter((f) => f.disposition !== "flag_only").map((f) => `${f.kind}: ${f.detail}`)],
    manualReviewRequired: candidate.manualReviewRequired || validation.manualReviewRequired,
  };
}

/** Validate the whole pool. Deterministic (id-sorted). Pure. */
export function validatePool(pool: readonly EngineCompetitorCandidate[], policy: IdentityPolicy): { candidates: EngineCompetitorCandidate[]; validations: IdentityValidation[] } {
  const sorted = [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const validations = sorted.map((c) => validateIdentity(c, sorted, policy));
  const candidates = sorted.map((c, i) => applyValidation(c, validations[i]!));
  return { candidates, validations };
}
