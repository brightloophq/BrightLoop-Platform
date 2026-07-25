/* =============================================================================
 * Safe provider claim parser (Phase C · Sprint C7) — the leak boundary.
 *
 * The ONLY place raw provider output is read. It accepts a single allowlisted
 * structured shape (`{ claims: [{ category, statement, evidenceIds, confidence }] }`)
 * and returns bounded, normalized, schema-validated `ProviderClaimCandidate`s.
 * Everything else is dropped:
 *   - a non-object / missing `claims` array → zero candidates;
 *   - an unknown claim field → ignored (never copied);
 *   - a statement over the cap → REJECTED (never truncated-and-kept as prose);
 *   - an evidence id not in the job's known set → rejected;
 *   - a duplicate → rejected; a count over the cap → rejected.
 *
 * By construction it copies only: a bounded normalized statement, an enum
 * category, known evidence ids, an integer confidence. No raw text, no prompt,
 * no chain-of-thought, no arbitrary JSON can survive. Errors carry safe reason
 * codes, never content. Deterministic: identical input → identical output.
 * ========================================================================== */

import {
  PROVIDER_CLAIM_LIMITS,
  providerClaimCandidateSchema,
  type ProviderClaimCandidate,
  type ProviderClaimCategory,
  type ProviderClaimRejection,
} from "@brightloop/schema";

const CATEGORIES: readonly ProviderClaimCategory[] = ["observation", "strength", "weakness", "risk", "opportunity", "context"];

export interface ParseClaimsResult {
  candidates: ProviderClaimCandidate[];
  /** Safe reason codes for dropped claims — never content. */
  rejections: ProviderClaimRejection[];
}

interface RawClaim {
  category?: unknown;
  statement?: unknown;
  evidenceIds?: unknown;
  confidence?: unknown;
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Parse validated provider output into safe claim candidates, bounded to the
 * evidence the reasoning job actually referenced.
 *
 * @param output          the VALIDATED structured output (never raw prose)
 * @param knownEvidenceIds evidence ids in scope for this run
 */
export function parseProviderClaims(output: unknown, knownEvidenceIds: ReadonlySet<string>): ParseClaimsResult {
  const rejections: ProviderClaimRejection[] = [];
  if (output === null || typeof output !== "object") return { candidates: [], rejections };

  const rawClaims = (output as { claims?: unknown }).claims;
  if (!Array.isArray(rawClaims)) return { candidates: [], rejections };

  const seen = new Set<string>();
  const accepted: ProviderClaimCandidate[] = [];

  let index = 0;
  for (const raw of rawClaims as RawClaim[]) {
    const i = index++;

    if (accepted.length >= PROVIDER_CLAIM_LIMITS.maxCandidates) {
      rejections.push("over_limit");
      continue;
    }
    if (raw === null || typeof raw !== "object") {
      rejections.push("malformed");
      continue;
    }

    const category: ProviderClaimCategory = CATEGORIES.includes(raw.category as ProviderClaimCategory) ? (raw.category as ProviderClaimCategory) : "observation";
    const statementRaw = typeof raw.statement === "string" ? collapse(raw.statement) : "";
    if (statementRaw === "") {
      rejections.push("malformed");
      continue;
    }
    if (statementRaw.length > PROVIDER_CLAIM_LIMITS.maxStatementChars) {
      rejections.push("statement_too_long");
      continue;
    }

    const evidenceIdsRaw = Array.isArray(raw.evidenceIds) ? raw.evidenceIds.filter((x): x is string => typeof x === "string") : [];
    if (evidenceIdsRaw.length === 0) {
      rejections.push("no_evidence");
      continue;
    }
    const unknown = evidenceIdsRaw.filter((id) => !knownEvidenceIds.has(id));
    if (unknown.length > 0) {
      rejections.push("unknown_evidence");
      continue;
    }
    const evidenceIds = [...new Set(evidenceIdsRaw)].sort().slice(0, PROVIDER_CLAIM_LIMITS.maxEvidenceIdsPerClaim);

    // Deduplicate by normalized statement + evidence set.
    const dedupeKey = `${statementRaw.toLowerCase()}::${evidenceIds.join(",")}`;
    if (seen.has(dedupeKey)) {
      rejections.push("duplicate");
      continue;
    }
    seen.add(dedupeKey);

    const confidence = typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? Math.max(0, Math.min(100, Math.round(raw.confidence))) : null;

    accepted.push(
      providerClaimCandidateSchema.parse({
        id: `claim:${i}`,
        category,
        statement: statementRaw,
        evidenceIds,
        confidence,
        validationStatus: "accepted",
        rejectionReason: null,
      }),
    );
  }

  // Deterministic ordering by (category, statement) — stable and content-addressed.
  accepted.sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : a.statement < b.statement ? -1 : a.statement > b.statement ? 1 : 0));
  // Re-stamp ids after sort so identical input yields identical ids.
  const candidates = accepted.map((c, i) => ({ ...c, id: `claim:${i}` }));

  return { candidates, rejections: [...new Set(rejections)].sort() };
}
