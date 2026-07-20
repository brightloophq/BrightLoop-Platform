/* =============================================================================
 * Competitor candidate model (Sprint 10 §1/§2 · AIS-005 §02) — PURE.
 *
 * Canonical candidate construction + the domain normalization that every dedupe,
 * alias, and duplicate check depends on. Uses the Sprint-5 pure regex URL parser
 * (the domain package is Node-free — no `URL` global, no `node:*`).
 *
 * A candidate may be DISCOVERED without evidence, but it may never be VALIDATED
 * without it (AIS-005 rule 1). `promoteToValidated` enforces that.
 * ========================================================================== */

import {
  engineCompetitorCandidateSchema,
  type EngineCompetitorCandidate,
  type CompetitorDiscoveryInput,
} from "@brightloop/schema";
import { parseUrl } from "../discovery/url.js";

/**
 * Normalize a domain for identity comparison: lowercase, strip scheme, strip
 * `www.`, strip trailing dot/slash, drop path/query. Deterministic; returns "" for
 * unparseable input rather than throwing.
 */
export function normalizeDomain(input: string): string {
  const raw = input.trim().toLowerCase();
  if (raw === "") return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
  const parsed = parseUrl(withScheme);
  const host = parsed === null ? raw.replace(/^.*:\/\//, "").split("/")[0]! : parsed.host;
  return host.replace(/^www\./, "").replace(/\.$/, "").split("/")[0]!.split("?")[0]!;
}

/** The registrable-ish root (last two labels) — used for parent/franchise checks. Pure. */
export function domainRoot(normalized: string): string {
  const parts = normalized.split(".").filter(Boolean);
  return parts.length <= 2 ? normalized : parts.slice(-2).join(".");
}

/** A conservative company-name key: lowercase alphanumerics, common suffixes dropped. Pure. */
const NAME_SUFFIXES = /\b(inc|llc|ltd|limited|corp|corporation|co|company|gmbh|plc|sa|srl|bv|pty)\b/g;
export function normalizeBusinessName(name: string): string {
  return name.toLowerCase().replace(NAME_SUFFIXES, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export interface NewCandidateInput {
  id: string;
  scanId: string;
  clientId: string | null;
  businessName: string;
  primaryDomain: string;
  discoveredAt: string;
  evidenceIds?: string[];
  evidenceState?: EngineCompetitorCandidate["evidenceState"];
  confidence: EngineCompetitorCandidate["confidence"];
  provenance: EngineCompetitorCandidate["provenance"];
  industry?: string | null;
  subIndustry?: string | null;
  geography?: string[];
  customerSegment?: string[];
  businessModel?: EngineCompetitorCandidate["businessModel"];
  productsServices?: string[];
  pricePosition?: EngineCompetitorCandidate["pricePosition"];
  observedChannels?: string[];
}

/** Build a validated `discovered` candidate with a normalized domain. Pure. */
export function newCompetitorCandidate(input: NewCandidateInput): EngineCompetitorCandidate {
  return engineCompetitorCandidateSchema.parse({
    id: input.id,
    scanId: input.scanId,
    clientId: input.clientId,
    businessName: input.businessName,
    primaryDomain: input.primaryDomain,
    normalizedDomain: normalizeDomain(input.primaryDomain),
    industry: input.industry ?? null,
    subIndustry: input.subIndustry ?? null,
    geography: input.geography ?? [],
    customerSegment: input.customerSegment ?? [],
    businessModel: input.businessModel ?? "unknown",
    productsServices: input.productsServices ?? [],
    pricePosition: input.pricePosition ?? "unknown",
    observedChannels: input.observedChannels ?? [],
    evidenceIds: input.evidenceIds ?? [],
    evidenceState: input.evidenceState ?? "observed",
    confidence: input.confidence,
    provenance: input.provenance,
    discoveredAt: input.discoveredAt,
    status: "discovered",
    exclusionReasons: [],
    manualReviewRequired: false,
  });
}

/**
 * Promote a candidate to `validated`. REFUSES (returns the candidate marked
 * `unavailable`) when it carries no evidence — rule 1: never fabricate a competitor.
 */
export function promoteToValidated(candidate: EngineCompetitorCandidate, minimumEvidenceCount = 1): EngineCompetitorCandidate {
  if (candidate.evidenceIds.length < Math.max(1, minimumEvidenceCount)) {
    return engineCompetitorCandidateSchema.parse({
      ...candidate,
      status: "unavailable",
      exclusionReasons: [...candidate.exclusionReasons, "insufficient evidence to validate"],
      manualReviewRequired: true,
    });
  }
  return engineCompetitorCandidateSchema.parse({ ...candidate, status: "validated" });
}

/** Domains the discovery policy excludes outright (normalized comparison). Pure. */
export function isExcludedDomain(candidate: EngineCompetitorCandidate, input: Pick<CompetitorDiscoveryInput, "excludedDomains">): boolean {
  const excluded = new Set(input.excludedDomains.map(normalizeDomain));
  return excluded.has(candidate.normalizedDomain);
}
