import { describe, expect, it } from "vitest";
import { DOMAIN_KEYS, indexDimensionSchema } from "@brightloop/schema";
import {
  DIMENSION_TO_DOMAIN,
  UNREACHABLE_DOMAINS,
  baselineScoresFromSummaries,
  findingsFromLedger,
  priorityFromSeverity,
  unreachableDomainLabels,
} from "./diagnosis-import";

describe("DIMENSION_TO_DOMAIN", () => {
  it("covers every engine dimension, so none is silently forgotten", () => {
    for (const dimension of indexDimensionSchema.options) {
      expect(dimension in DIMENSION_TO_DOMAIN).toBe(true);
    }
  });

  it("only ever targets real System Map domains", () => {
    for (const target of Object.values(DIMENSION_TO_DOMAIN)) {
      if (target !== null) expect(DOMAIN_KEYS).toContain(target);
    }
  });

  it("leaves growth, risk and opportunity unmapped — they are not domains", () => {
    expect(DIMENSION_TO_DOMAIN.growth).toBeNull();
    expect(DIMENSION_TO_DOMAIN.risk).toBeNull();
    expect(DIMENSION_TO_DOMAIN.opportunity).toBeNull();
  });

  it("names the domains a scan cannot reach, rather than hiding them", () => {
    expect(UNREACHABLE_DOMAINS).toEqual(["delivery", "analytics"]);
    expect(unreachableDomainLabels()).toBe("Delivery and Analytics");
  });
});

describe("baselineScoresFromSummaries", () => {
  it("maps a dimension onto its domain", () => {
    expect(baselineScoresFromSummaries([{ domain: "operations", score: 61 }])).toEqual([
      { key: "operations", score: 61, from: ["operations"] },
    ]);
  });

  it("averages the dimensions that share a domain", () => {
    // Digital is fed by digital_presence and brand.
    const [digital] = baselineScoresFromSummaries([
      { domain: "digital_presence", score: 40 },
      { domain: "brand", score: 60 },
    ]);
    expect(digital).toEqual({ key: "web", score: 50, from: ["digital_presence", "brand"] });
  });

  it("rounds the mean to an integer, since the map stores integers", () => {
    const [sales] = baselineScoresFromSummaries([
      { domain: "sales", score: 50 },
      { domain: "marketing", score: 51 },
    ]);
    expect(sales?.score).toBe(51);
    expect(Number.isInteger(sales?.score)).toBe(true);
  });

  /* ---- the honesty rules -------------------------------------------------- */

  it("EXCLUDES a null score from the average instead of counting it as zero", () => {
    // brand unmeasured must not halve Digital's score.
    const [digital] = baselineScoresFromSummaries([
      { domain: "digital_presence", score: 80 },
      { domain: "brand", score: null },
    ]);
    expect(digital?.score).toBe(80);
    expect(digital?.from).toEqual(["digital_presence"]);
  });

  it("produces nothing for a domain whose dimensions are all unmeasured", () => {
    expect(baselineScoresFromSummaries([{ domain: "brand", score: null }])).toEqual([]);
  });

  it("never invents a score for Delivery or Analytics", () => {
    const scores = baselineScoresFromSummaries(
      indexDimensionSchema.options.map((domain) => ({ domain, score: 70 })),
    );
    const keys = scores.map((s) => s.key);
    expect(keys).not.toContain("delivery");
    expect(keys).not.toContain("analytics");
  });

  it("drops unmapped dimensions rather than filing them somewhere", () => {
    expect(baselineScoresFromSummaries([{ domain: "growth", score: 90 }])).toEqual([]);
  });

  it("ignores a score outside 0–100 rather than storing an impossible baseline", () => {
    expect(baselineScoresFromSummaries([{ domain: "sales", score: 140 }])).toEqual([]);
    expect(baselineScoresFromSummaries([{ domain: "sales", score: -5 }])).toEqual([]);
  });

  it("keeps a real zero — the worst score is still a score", () => {
    expect(baselineScoresFromSummaries([{ domain: "sales", score: 0 }])).toEqual([
      { key: "sales", score: 0, from: ["sales"] },
    ]);
  });
});

describe("priorityFromSeverity", () => {
  it("never demotes a critical finding", () => {
    expect(priorityFromSeverity("critical")).toBe("high");
    expect(priorityFromSeverity("high")).toBe("high");
  });

  it("maps the rest", () => {
    expect(priorityFromSeverity("moderate")).toBe("medium");
    expect(priorityFromSeverity("low")).toBe("low");
  });

  it("defaults to medium for anything unrecognised", () => {
    expect(priorityFromSeverity(undefined)).toBe("medium");
    expect(priorityFromSeverity("spicy")).toBe("medium");
  });
});

describe("findingsFromLedger", () => {
  it("maps a finding onto its domain with its impact as the baseline", () => {
    expect(
      findingsFromLedger([
        {
          title: "No booking flow on mobile",
          domain: "digital_presence",
          severity: "high",
          businessImpact: "Enquiries drop off before contact.",
        },
      ]),
    ).toEqual([
      {
        domainKey: "web",
        finding: "No booking flow on mobile",
        baseline: "Enquiries drop off before contact.",
        priority: "high",
      },
    ]);
  });

  it("DROPS a finding whose dimension has no domain, rather than misfiling it", () => {
    expect(findingsFromLedger([{ title: "Market is growing", domain: "growth" }])).toEqual([]);
  });

  it("skips an empty title, which could not be stored anyway", () => {
    expect(findingsFromLedger([{ title: "   ", domain: "sales" }])).toEqual([]);
  });

  it("truncates to the column limits instead of being rejected on save", () => {
    const [finding] = findingsFromLedger([
      { title: "x".repeat(900), domain: "sales", businessImpact: "y".repeat(400) },
    ]);
    expect(finding!.finding.length).toBeLessThanOrEqual(500);
    expect(finding!.baseline!.length).toBeLessThanOrEqual(120);
    expect(finding!.finding.endsWith("…")).toBe(true);
  });

  it("leaves the baseline null when there is no impact text", () => {
    const [finding] = findingsFromLedger([{ title: "Something", domain: "sales" }]);
    expect(finding!.baseline).toBeNull();
  });
});
