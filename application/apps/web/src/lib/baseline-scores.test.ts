import { describe, expect, it } from "vitest";
import { DOMAIN_KEYS } from "@brightloop/schema";
import { readBaselineScores, scoreField } from "./baseline-scores";

const form = (fields: Record<string, string>): Pick<FormData, "get"> => ({
  get: (name: string) => (name in fields ? fields[name]! : null),
});

describe("readBaselineScores", () => {
  it("reads the domains that were filled in", () => {
    const result = readBaselineScores(form({ score_web: "40", score_ai: "10" }));
    expect(result).toEqual({
      scores: [
        { key: "web", score: 40 },
        { key: "ai", score: 10 },
      ],
    });
  });

  /* ---- the rule this module exists for ------------------------------------ */

  it("treats a BLANK field as unscored, never as zero", () => {
    const result = readBaselineScores(form({ score_web: "40", score_sales: "" }));
    expect("scores" in result && result.scores).toEqual([{ key: "web", score: 40 }]);
    // The skipped domain must be absent — not present with a 0 nobody chose.
    expect(JSON.stringify(result)).not.toContain('"sales"');
  });

  it("treats a whitespace-only field as unscored too", () => {
    // Number("   ") is 0, so trimming has to happen before parsing.
    const result = readBaselineScores(form({ score_web: "   " }));
    expect(result).toEqual({ scores: [] });
  });

  it("treats a missing field as unscored", () => {
    expect(readBaselineScores(form({}))).toEqual({ scores: [] });
  });

  it("DOES accept a deliberate zero", () => {
    // Zero is a real score — the worst one — and must be storable.
    expect(readBaselineScores(form({ score_crm: "0" }))).toEqual({
      scores: [{ key: "crm", score: 0 }],
    });
  });

  it("accepts the full range", () => {
    expect(readBaselineScores(form({ score_crm: "100" }))).toEqual({
      scores: [{ key: "crm", score: 100 }],
    });
  });

  /* ---- refusals ----------------------------------------------------------- */

  it("refuses a score outside 0–100, naming the domain in words", () => {
    const result = readBaselineScores(form({ score_web: "140" }));
    expect("error" in result && result.error).toContain("Digital");
    expect("error" in result && result.error).toContain("0 and 100");
  });

  it("refuses a negative score", () => {
    expect(readBaselineScores(form({ score_web: "-1" }))).toHaveProperty("error");
  });

  it("refuses text", () => {
    expect(readBaselineScores(form({ score_web: "good" }))).toHaveProperty("error");
  });

  it("covers every domain key, so no domain is silently unscoreable", () => {
    const fields = Object.fromEntries(DOMAIN_KEYS.map((k) => [scoreField(k), "50"]));
    const result = readBaselineScores(form(fields));
    expect("scores" in result && result.scores).toHaveLength(DOMAIN_KEYS.length);
  });
});
