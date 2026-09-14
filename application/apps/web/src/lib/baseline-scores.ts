/* =============================================================================
 * Baseline scores — reading the seven domain fields off the diagnosis form.
 *
 * Pure and unit-tested, because the one rule that matters here is easy to get
 * wrong and impossible to see afterwards: a BLANK field means "I have not
 * scored this domain yet", and must never be read as zero. Zero is a real
 * score — the worst one — so writing it for a field someone simply skipped
 * would silently record a judgement they never made, and drag the Baseline
 * Index down with it.
 * ========================================================================== */

import { DOMAIN_KEYS, DOMAIN_META, type DomainKey } from "@brightloop/schema";

export interface BaselineScore {
  key: DomainKey;
  score: number;
}

/** Field name for one domain's score input. */
export function scoreField(key: DomainKey): string {
  return `score_${key}`;
}

/**
 * The scores actually entered, or the first field that is not usable.
 *
 * Returns only the domains the person filled in; an untouched field is absent
 * from the result rather than present as 0.
 */
export function readBaselineScores(
  formData: Pick<FormData, "get">,
): { scores: BaselineScore[] } | { error: string } {
  const scores: BaselineScore[] = [];

  for (const key of DOMAIN_KEYS) {
    const raw = String(formData.get(scoreField(key)) ?? "").trim();
    if (raw === "") continue;

    const score = Number(raw);
    // `Number("")` is 0 and `Number(" ")` is 0, which is why the blank check
    // happens first and on the TRIMMED string, never on the parsed number.
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return { error: `${DOMAIN_META[key].label} must be a score between 0 and 100.` };
    }

    scores.push({ key, score });
  }

  return { scores };
}
