/* =============================================================================
 * Business profile derivation (Phase C · Sprint C5) — PURE, evidence-only.
 *
 * Builds the structured picture of WHO the prospect is, strictly from what the
 * evidence actually contains. Every field is a `ProfileField` carrying its own
 * evidence ids, confidence and basis:
 *
 *   observed  — the value was read directly from evidence
 *   derived   — computed from other evidenced values (never from nothing)
 *   unknown   — value is null; the field name is listed in `unknownFields`
 *
 * There is no branch that guesses a name, a size, or a location. An unevidenced
 * field stays null and is reported as unknown, which is a finding in itself.
 * ========================================================================== */

import {
  prospectProfileSchema,
  type EngineEvidenceItem,
  type MaturityAssessment,
  type ProfileField,
  type ProfileIndicator,
  type ProspectProfile,
} from "@brightloop/schema";
import { itemConfidence, zeroConfidence } from "./confidence.js";
import { extractSignals, signalsFor, weightedSignalScore } from "./scoring.js";

const clamp01 = (n: number) => (Number.isFinite(n) ? (n < 0 ? 0 : n > 1 ? 1 : n) : 0);

/** Read the first non-empty string at `path` across usable evidence. */
function readString(items: readonly EngineEvidenceItem[], path: string): { value: string; ids: string[] } | null {
  const hits: { value: string; id: string }[] = [];
  for (const item of items) {
    if (item.state === "unavailable") continue;
    const raw = item.value[path];
    if (typeof raw === "string" && raw.trim() !== "") hits.push({ value: raw.trim(), id: item.id });
  }
  if (hits.length === 0) return null;
  // Deterministic: the most frequent value wins; ties break alphabetically.
  const counts = new Map<string, string[]>();
  for (const h of hits) counts.set(h.value, [...(counts.get(h.value) ?? []), h.id]);
  const best = [...counts.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))[0]!;
  return { value: best[0], ids: [...new Set(best[1])].sort() };
}

/** Read a deduplicated string list at `path` across usable evidence. */
function readStringList(items: readonly EngineEvidenceItem[], path: string, limit = 12): { values: string[]; ids: string[] } {
  const values = new Set<string>();
  const ids = new Set<string>();
  for (const item of items) {
    if (item.state === "unavailable") continue;
    const raw = item.value[path];
    if (!Array.isArray(raw)) continue;
    let used = false;
    for (const entry of raw) {
      if (typeof entry === "string" && entry.trim() !== "") {
        values.add(entry.trim());
        used = true;
      }
    }
    if (used) ids.add(item.id);
  }
  return { values: [...values].sort().slice(0, limit), ids: [...ids].sort() };
}

/** An evidenced field, or an explicit unknown. */
function field(items: readonly EngineEvidenceItem[], hit: { value: string; ids: string[] } | null, basis: "observed" | "derived" = "observed"): ProfileField {
  if (hit === null) return { value: null, evidenceIds: [], confidence: zeroConfidence(), basis: "unknown" };
  return { value: hit.value, evidenceIds: hit.ids, confidence: itemConfidence(items, hit.ids), basis };
}

/** Build a 0–1 indicator from a category's own signals, with its calculation. */
function indicator(items: readonly EngineEvidenceItem[], category: Parameters<typeof signalsFor>[0]): ProfileIndicator {
  const specs = signalsFor(category);
  const { resolved, missing } = extractSignals(items, specs);
  const { score, calculation } = weightedSignalScore(resolved, missing);
  return {
    value: score === null ? null : clamp01(score / 100),
    evidenceIds: [...new Set(resolved.flatMap((s) => s.evidenceIds))].sort(),
    calculation,
  };
}

/** Digital-maturity band from the composite score. Derived, never invented. */
export function digitalMaturityBand(overall: number | null): string | null {
  if (overall === null) return null;
  if (overall < 25) return "nascent";
  if (overall < 50) return "developing";
  if (overall < 75) return "established";
  return "advanced";
}

export interface ProfileInput {
  scanId: string;
  items: readonly EngineEvidenceItem[];
  maturity: MaturityAssessment;
  /** The industry classification, when one was supported by evidence. */
  industryCategory?: string | null;
  industryEvidenceIds?: readonly string[];
  now: string;
}

/**
 * Derive the business profile. Fields with no supporting evidence are null and
 * named in `unknownFields` — the engine reports the gap instead of filling it.
 */
export function deriveProfile(input: ProfileInput): ProspectProfile {
  const items = input.items;

  const identity = field(items, readString(items, "businessName") ?? readString(items, "siteTitle"));
  const websiteUrl = field(items, readString(items, "siteUrl") ?? readString(items, "canonicalUrl"));
  const geography = field(items, readString(items, "location") ?? readString(items, "addressRegion"));
  const size = field(items, readString(items, "sizeSignal"));

  const category: ProfileField =
    input.industryCategory === undefined || input.industryCategory === null
      ? { value: null, evidenceIds: [], confidence: zeroConfidence(), basis: "unknown" }
      : {
          value: input.industryCategory,
          evidenceIds: [...(input.industryEvidenceIds ?? [])],
          confidence: itemConfidence(items, input.industryEvidenceIds ?? []),
          basis: "derived",
        };

  const maturityBand = digitalMaturityBand(input.maturity.overall);
  const digitalMaturity: ProfileField =
    maturityBand === null
      ? { value: null, evidenceIds: [], confidence: zeroConfidence(), basis: "unknown" }
      : {
          value: maturityBand,
          evidenceIds: input.maturity.categories.flatMap((c) => c.evidenceIds).filter((v, i, a) => a.indexOf(v) === i).sort(),
          confidence: input.maturity.confidence,
          basis: "derived",
        };

  const services = readStringList(items, "services");
  const trust = readStringList(items, "trustIndicators");
  const operational = readStringList(items, "operationalIndicators");

  const contactConfidence = indicator(items, "lead_capture");
  const websiteCompleteness = indicator(items, "website");
  const contentFreshness = indicator(items, "content");

  const unknownFields: string[] = [];
  const named: [string, ProfileField][] = [
    ["identity", identity],
    ["websiteUrl", websiteUrl],
    ["category", category],
    ["digitalMaturity", digitalMaturity],
    ["size", size],
    ["geography", geography],
  ];
  for (const [name, f] of named) if (f.value === null) unknownFields.push(name);
  if (services.values.length === 0) unknownFields.push("primaryServices");
  if (contactConfidence.value === null) unknownFields.push("contactConfidence");
  if (websiteCompleteness.value === null) unknownFields.push("websiteCompleteness");
  if (contentFreshness.value === null) unknownFields.push("contentFreshness");

  const limitations: string[] = [];
  if (unknownFields.length > 0) {
    limitations.push(`${unknownFields.length} profile field(s) are not evidenced and remain unknown: ${unknownFields.join(", ")}.`);
  }
  if (size.value === null) {
    limitations.push("Business size is not observable from a public website; it requires a discovery conversation or a data provider.");
  }

  const evidenceIds = [
    ...new Set([
      ...identity.evidenceIds,
      ...websiteUrl.evidenceIds,
      ...geography.evidenceIds,
      ...size.evidenceIds,
      ...category.evidenceIds,
      ...services.ids,
      ...trust.ids,
      ...operational.ids,
      ...contactConfidence.evidenceIds,
      ...websiteCompleteness.evidenceIds,
      ...contentFreshness.evidenceIds,
    ]),
  ].sort();

  return prospectProfileSchema.parse({
    scanId: input.scanId,
    identity,
    websiteUrl,
    category,
    primaryServices: services.values,
    primaryServicesEvidenceIds: services.ids,
    digitalMaturity,
    size,
    geography,
    contactConfidence,
    websiteCompleteness,
    contentFreshness,
    trustIndicators: trust.values,
    operationalIndicators: operational.values,
    unknownFields: unknownFields.sort(),
    limitations,
    evidenceIds,
    generatedAt: input.now,
  });
}
