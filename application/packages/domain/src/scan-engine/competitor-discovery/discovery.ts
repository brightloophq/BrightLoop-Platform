/* =============================================================================
 * Competitor Discovery Producer (Post-scan commercial workflow) — PURE.
 *
 * Turns the prospect's OWN outbound references (external + social links already
 * captured by the crawler and persisted in `discovery_manifest`) plus any
 * admin-supplied competitor domains into VERIFIED competitor evidence, then runs
 * the deterministic C8 Competitor Intelligence step over it.
 *
 * ██ ABSOLUTE RULE — NEVER INVENT A COMPETITOR ██
 *   • A candidate is only ever a SEED. It becomes competitor evidence ONLY after
 *     the AIS-005 identity gate (directories, social, marketplaces, suppliers,
 *     duplicates, the client itself, non-commercial) and ONLY when it carries
 *     evidence (a real reference on the prospect's site, or an explicit admin
 *     assertion recorded as manual_input evidence).
 *   • `ambiguous` candidates are surfaced for HUMAN REVIEW, never asserted.
 *   • No search, no scraping, no HTTP, no model call, no inferred names.
 *   • No references + nothing admin-supplied ⇒ the C8 snapshot is `unavailable`
 *     with reason `no_competitor_evidence` — a legitimate COMPLETED outcome
 *     (the caller distinguishes "insufficient evidence" from "not run").
 *
 * Deterministic given `now` + a deterministic `idFor`. No I/O.
 * ========================================================================== */

import {
  type CompetitorIntelligenceSnapshot,
  type EngineCompetitorCandidate,
  type EngineEvidenceItem,
  type EvidenceConfidence,
  type IdentityValidation,
  type Provenance,
} from "@brightloop/schema";
import { normalizeEvidence } from "../evidence/normalize.js";
import {
  domainRoot,
  newCompetitorCandidate,
  normalizeDomain,
} from "../competitor-intelligence/candidate.js";
import { validatePool, type IdentityPolicy } from "../competitor-intelligence/identity.js";
import { confidenceBandFor } from "../competitor-intelligence/confidence.js";
import { runCompetitorIntelligence } from "../competitor-intelligence/runtime.js";
import { extractCompetitorReferences, type CompetitorReference } from "./refs.js";

export interface CompetitorDiscoveryParams {
  scanId: string;
  clientId: string | null;
  /** The prospect's own domain — used as the identity policy's client domain. */
  prospectDomain: string;
  /** The persisted `discovery_manifest` envelope; references are extracted from it. */
  manifestEnvelope?: Record<string, unknown>;
  /** Pre-extracted references (bypasses the manifest — used by tests). */
  references?: readonly CompetitorReference[];
  /** Admin-supplied competitor domains (higher-trust; still human-reviewed). */
  manualCompetitorDomains?: readonly string[];
  /** Domains the operator has explicitly excluded from discovery. */
  excludedDomains?: readonly string[];
  /** The persisted evidence bundle — resolves reference source pages to evidence ids. */
  evidenceBundle: readonly EngineEvidenceItem[];
  /** Upstream artifact ids this snapshot derives from (lineage only). */
  sourceArtifactIds?: readonly string[];
  now: string;
  /** A domain must be referenced by at least this many of the prospect's pages. */
  minPageCount?: number;
  /** Deterministic id factory; defaults to `<prefix>:<scanId>:<n>`. */
  idFor?: (prefix: string) => string;
}

export interface CompetitorDiscoveryResult {
  /** The outbound references considered (post-extraction, pre-validation). */
  references: CompetitorReference[];
  /** Every candidate with its final identity status (validated/ambiguous/rejected/excluded). */
  candidates: EngineCompetitorCandidate[];
  /** The identity validation record for each candidate (findings + disposition). */
  validations: IdentityValidation[];
  /** manual_input evidence items minted for admin-supplied competitors. */
  manualEvidence: EngineEvidenceItem[];
  /** source="competitors" evidence items minted for VALIDATED candidates only. */
  competitorEvidence: EngineEvidenceItem[];
  /** The deterministic C8 snapshot over (bundle + manual + competitor evidence). */
  snapshot: CompetitorIntelligenceSnapshot;
  counts: {
    discovered: number;
    validated: number;
    ambiguous: number;
    rejectedOrExcluded: number;
  };
}

/** A conservative, defensible candidate confidence — never inflated. Pure. */
function candidateConfidence(pageCount: number, manual: boolean): EvidenceConfidence {
  // More corroborating source pages ⇒ slightly higher; admin assertion is mid.
  const coverage = manual ? 0.6 : Math.min(1, 0.3 + 0.1 * Math.max(0, pageCount - 1));
  const reliability = manual ? 0.6 : 0.4; // a reference is weak evidence of rivalry
  const completeness = 0.4; // identity only; no comparative data yet
  const raw = (coverage + reliability + completeness) / 3;
  const value = Math.round(raw * 100);
  return {
    value,
    band: confidenceBandFor(value),
    inputs: { coverage, reliability, freshness: 1, agreement: 1, completeness, provenanceQuality: manual ? 0.7 : 0.6 },
  };
}

function candidateProvenance(origin: string, manual: boolean, now: string): Provenance {
  return {
    origin,
    collectedAt: now,
    method: manual ? "manual" : "computed",
    transformed: true,
    transformations: ["competitor-discovery"],
    stage: "competitor_discovery",
    providerId: null,
  };
}

interface Seed {
  normalizedDomain: string;
  manual: boolean;
  urls: string[];
  sourcePageUrls: string[];
  pageCount: number;
}

/**
 * Run evidence-only competitor discovery. Pure — no fetching, no search, no model
 * call. Returns validated candidates, the competitor evidence minted from them,
 * and the deterministic C8 snapshot.
 */
export function runCompetitorDiscovery(input: CompetitorDiscoveryParams): CompetitorDiscoveryResult {
  const { scanId, clientId, now } = input;
  const minPageCount = Math.max(1, input.minPageCount ?? 1);
  const idFor = input.idFor ?? ((prefix: string) => `${prefix}:${scanId}`);
  let counter = 0;
  const nextId = (prefix: string): string => `${idFor(prefix)}:${++counter}`;

  const prospectDomain = normalizeDomain(input.prospectDomain);
  const references = input.references ? [...input.references] : input.manifestEnvelope ? extractCompetitorReferences(input.manifestEnvelope) : [];

  // Resolve a source page URL to a KNOWN evidence id in the bundle (origin/citation match).
  const originToId = new Map<string, string>();
  for (const item of input.evidenceBundle) {
    const origin = item.provenance.origin;
    if (origin && !originToId.has(origin)) originToId.set(origin, item.id);
    for (const c of item.citations) if (c && !originToId.has(c)) originToId.set(c, item.id);
  }

  // Merge crawl references + admin-supplied domains into one seed per domain.
  const seeds = new Map<string, Seed>();
  for (const ref of references) {
    if (ref.normalizedDomain === "" || ref.pageCount < minPageCount) continue;
    seeds.set(ref.normalizedDomain, {
      normalizedDomain: ref.normalizedDomain,
      manual: false,
      urls: ref.urls,
      sourcePageUrls: ref.sourcePageUrls,
      pageCount: ref.pageCount,
    });
  }
  for (const raw of input.manualCompetitorDomains ?? []) {
    const nd = normalizeDomain(raw);
    if (nd === "") continue;
    const prior = seeds.get(nd);
    seeds.set(nd, {
      normalizedDomain: nd,
      manual: true,
      urls: prior?.urls ?? [`https://${nd}`],
      sourcePageUrls: prior?.sourcePageUrls ?? [],
      pageCount: prior?.pageCount ?? 0,
    });
  }

  const orderedSeeds = [...seeds.values()].sort((a, b) => (a.normalizedDomain < b.normalizedDomain ? -1 : 1));

  // Build candidates + (for admin-supplied) a manual_input evidence item so the
  // candidate carries real, cited evidence rather than an unbacked assertion.
  const manualEvidence: EngineEvidenceItem[] = [];
  const candidates: EngineCompetitorCandidate[] = [];
  const candidateSeed = new Map<string, Seed>(); // candidateId → seed (for evidence minting)

  for (const seed of orderedSeeds) {
    const evidenceIds: string[] = [];
    for (const url of seed.sourcePageUrls) {
      const id = originToId.get(url);
      if (id !== undefined) evidenceIds.push(id);
    }
    if (seed.manual) {
      const mid = nextId("manev");
      manualEvidence.push(
        normalizeEvidence(
          {
            id: mid,
            scanId,
            source: "manual_input",
            state: "observed",
            timestamp: now,
            provenance: candidateProvenance(`operator://competitor/${seed.normalizedDomain}`, true, now),
            value: { assertion: "competitor", competitorDomain: seed.normalizedDomain },
            citations: [`https://${seed.normalizedDomain}`],
            metadata: { competitorDomain: seed.normalizedDomain },
          },
          now,
        ),
      );
      evidenceIds.push(mid);
    }
    const uniqueEvidenceIds = [...new Set(evidenceIds)].sort();
    const candidateId = nextId("cand");
    const candidate = newCompetitorCandidate({
      id: candidateId,
      scanId,
      clientId,
      businessName: domainRoot(seed.normalizedDomain) || seed.normalizedDomain,
      primaryDomain: seed.normalizedDomain,
      discoveredAt: now,
      evidenceIds: uniqueEvidenceIds,
      evidenceState: seed.manual ? "observed" : "inferred",
      confidence: candidateConfidence(seed.pageCount, seed.manual),
      provenance: candidateProvenance(seed.urls[0] ?? `https://${seed.normalizedDomain}`, seed.manual, now),
    });
    candidates.push(candidate);
    candidateSeed.set(candidateId, seed);
  }

  // Identity gate: reject directories/social/marketplaces/suppliers/duplicates/the
  // client itself; mark evidence-less / regional / category mismatches ambiguous.
  const policy: IdentityPolicy = {
    clientDomain: prospectDomain,
    discovery: { excludedDomains: [...(input.excludedDomains ?? [])] },
    minimumEvidenceCount: 1,
  };
  const { candidates: validated, validations } = validatePool(candidates, policy);

  // Mint competitor evidence ONLY for validated candidates. Ambiguous/rejected are
  // never asserted (ambiguous is surfaced for review via the counts + candidates).
  const competitorEvidence: EngineEvidenceItem[] = [];
  for (const candidate of validated) {
    if (candidate.status !== "validated") continue;
    const seed = candidateSeed.get(candidate.id);
    const supporting = [...candidate.evidenceIds].sort();
    const citations = [...new Set([...(seed?.sourcePageUrls ?? []), ...(seed?.urls ?? [])])].sort();
    competitorEvidence.push(
      normalizeEvidence(
        {
          id: nextId("compev"),
          scanId,
          source: "competitors",
          state: "inferred", // the ENTITY is observed; the RIVALRY is inferred → human review
          timestamp: now,
          provenance: candidateProvenance(candidate.primaryDomain, seed?.manual ?? false, now),
          // No signal/statement: we assert existence + provenance only, never an
          // invented strength/weakness. C8 lists the competitor with empty buckets.
          value: {
            competitor: candidate.businessName,
            supportingEvidenceIds: supporting,
          },
          citations,
          metadata: { normalizedDomain: candidate.normalizedDomain, discoveredVia: seed?.manual ? "manual" : "site_reference" },
        },
        now,
      ),
    );
  }

  const augmentedBundle = [...input.evidenceBundle, ...manualEvidence, ...competitorEvidence];
  const snapshot = runCompetitorIntelligence({
    scanId,
    evidence: augmentedBundle,
    sourceArtifactIds: input.sourceArtifactIds,
    now,
    idFor: (prefix) => `${idFor(prefix)}:cd`,
  });

  const validatedCount = validated.filter((c) => c.status === "validated").length;
  const ambiguousCount = validated.filter((c) => c.status === "ambiguous").length;
  const rejectedOrExcluded = validated.filter((c) => c.status === "rejected" || c.status === "excluded").length;

  return {
    references,
    candidates: validated,
    validations,
    manualEvidence,
    competitorEvidence,
    snapshot,
    counts: {
      discovered: validated.length,
      validated: validatedCount,
      ambiguous: ambiguousCount,
      rejectedOrExcluded,
    },
  };
}
