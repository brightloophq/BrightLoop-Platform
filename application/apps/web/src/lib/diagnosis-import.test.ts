import { describe, expect, it } from "vitest";
import {
  DOMAIN_KEYS,
  indexDimensionSchema,
  maturityCategorySchema,
  prospectRiskCategorySchema,
} from "@brightloop/schema";
import {
  CATEGORY_TO_DOMAIN,
  DIMENSION_TO_DOMAIN,
  RISK_CATEGORY_TO_DOMAIN,
  UNREACHABLE_DOMAINS,
  baselineScoresFromSummaries,
  domainForTerm,
  findingsFromLedger,
  findingsFromRisks,
  findingsFromWeaknesses,
  importedDiagnosis,
  reconcileLedger,
  priorityFromObservedScore,
  priorityFromSeverity,
  unreachableDomainLabels,
} from "./diagnosis-import";

describe("the vocabulary maps", () => {
  it("covers every maturity category, so none is silently forgotten", () => {
    for (const category of maturityCategorySchema.options) {
      expect(category in CATEGORY_TO_DOMAIN).toBe(true);
    }
  });

  it("covers every engine dimension and risk category too", () => {
    for (const dimension of indexDimensionSchema.options) {
      expect(dimension in DIMENSION_TO_DOMAIN).toBe(true);
    }
    for (const category of prospectRiskCategorySchema.options) {
      expect(category in RISK_CATEGORY_TO_DOMAIN).toBe(true);
    }
  });

  it("only ever targets real System Map domains", () => {
    const targets = [
      ...Object.values(CATEGORY_TO_DOMAIN),
      ...Object.values(DIMENSION_TO_DOMAIN),
      ...Object.values(RISK_CATEGORY_TO_DOMAIN),
    ];
    for (const target of targets) {
      if (target !== null) expect(DOMAIN_KEYS).toContain(target);
    }
  });

  it("agrees with itself wherever two vocabularies share a word", () => {
    // domainForTerm resolves one term through all three maps, so a word that
    // appears in more than one must not mean two different domains.
    const maps = [CATEGORY_TO_DOMAIN, DIMENSION_TO_DOMAIN, RISK_CATEGORY_TO_DOMAIN] as const;
    const seen = new Map<string, string | null>();
    for (const map of maps) {
      for (const [term, domain] of Object.entries(map)) {
        if (seen.has(term)) expect(seen.get(term)).toBe(domain);
        else seen.set(term, domain);
      }
    }
  });

  it("leaves growth, risk and opportunity unmapped — they are not domains", () => {
    expect(DIMENSION_TO_DOMAIN.growth).toBeNull();
    expect(DIMENSION_TO_DOMAIN.risk).toBeNull();
    expect(DIMENSION_TO_DOMAIN.opportunity).toBeNull();
  });

  it("reaches Analytics now that a scan scores it", () => {
    expect(CATEGORY_TO_DOMAIN.analytics).toBe("analytics");
    expect(UNREACHABLE_DOMAINS).toEqual(["delivery"]);
    expect(unreachableDomainLabels()).toBe("Delivery");
  });

  it("resolves a term from any vocabulary, and nothing from none", () => {
    expect(domainForTerm("lead_capture")).toBe("sales");
    expect(domainForTerm("digital_presence")).toBe("web");
    expect(domainForTerm("compliance")).toBe("operations");
    expect(domainForTerm("growth")).toBeNull();
    expect(domainForTerm("spicy")).toBeNull();
    expect(domainForTerm(undefined)).toBeNull();
    // Never let a prototype key masquerade as a mapping.
    expect(domainForTerm("toString")).toBeNull();
    expect(domainForTerm("constructor")).toBeNull();
  });
});

describe("baselineScoresFromSummaries", () => {
  it("reads the `category` key the prospect report actually writes", () => {
    expect(baselineScoresFromSummaries([{ category: "operations", score: 61 }])).toEqual([
      { key: "operations", score: 61, from: ["operations"] },
    ]);
  });

  it("still reads the engine report's `domain` key", () => {
    expect(baselineScoresFromSummaries([{ domain: "customer_experience", score: 44 }])).toEqual([
      { key: "crm", score: 44, from: ["customer_experience"] },
    ]);
  });

  it("averages the categories that share a domain", () => {
    const [digital] = baselineScoresFromSummaries([
      { category: "website", score: 40 },
      { category: "seo", score: 60 },
    ]);
    expect(digital).toEqual({ key: "web", score: 50, from: ["website", "seo"] });
  });

  it("rounds the mean to an integer, since the map stores integers", () => {
    const [sales] = baselineScoresFromSummaries([
      { category: "social_presence", score: 50 },
      { category: "lead_capture", score: 51 },
    ]);
    expect(sales?.score).toBe(51);
    expect(Number.isInteger(sales?.score)).toBe(true);
  });

  /* ---- the honesty rules -------------------------------------------------- */

  it("EXCLUDES a null score from the average instead of counting it as zero", () => {
    const [digital] = baselineScoresFromSummaries([
      { category: "website", score: 80 },
      { category: "seo", score: null },
    ]);
    expect(digital?.score).toBe(80);
    expect(digital?.from).toEqual(["website"]);
  });

  it("produces nothing for a domain whose categories are all unmeasured", () => {
    expect(baselineScoresFromSummaries([{ category: "branding", score: null }])).toEqual([]);
  });

  it("never invents a score for Delivery", () => {
    const scores = baselineScoresFromSummaries(
      maturityCategorySchema.options.map((category) => ({ category, score: 70 })),
    );
    expect(scores.map((s) => s.key)).not.toContain("delivery");
  });

  it("drops unmapped terms rather than filing them somewhere", () => {
    expect(baselineScoresFromSummaries([{ domain: "growth", score: 90 }])).toEqual([]);
  });

  it("ignores a score outside 0–100 rather than storing an impossible baseline", () => {
    expect(baselineScoresFromSummaries([{ category: "seo", score: 140 }])).toEqual([]);
    expect(baselineScoresFromSummaries([{ category: "seo", score: -5 }])).toEqual([]);
  });

  it("keeps a real zero — the worst score is still a score", () => {
    expect(baselineScoresFromSummaries([{ category: "seo", score: 0 }])).toEqual([
      { key: "web", score: 0, from: ["seo"] },
    ]);
  });

  it("survives an envelope that is not an array of rows", () => {
    expect(baselineScoresFromSummaries(undefined)).toEqual([]);
    expect(baselineScoresFromSummaries("nope")).toEqual([]);
    expect(baselineScoresFromSummaries([null, 7, { category: "seo", score: 30 }])).toEqual([
      { key: "web", score: 30, from: ["seo"] },
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

describe("priorityFromObservedScore", () => {
  it("reads a low observed score as the more urgent gap", () => {
    expect(priorityFromObservedScore(12)).toBe("high");
    expect(priorityFromObservedScore(55)).toBe("medium");
    expect(priorityFromObservedScore(88)).toBe("low");
  });

  it("does not guess when there is no number", () => {
    expect(priorityFromObservedScore(undefined)).toBe("medium");
    expect(priorityFromObservedScore(Number.NaN)).toBe("medium");
  });
});

describe("findingsFromRisks", () => {
  it("maps a risk onto its domain with its description as the baseline", () => {
    expect(
      findingsFromRisks([
        {
          title: "No contact route on mobile",
          category: "trust",
          severity: "high",
          description: "Enquiries drop off before contact.",
        },
      ]),
    ).toEqual([
      {
        domainKey: "web",
        finding: "No contact route on mobile",
        baseline: "Enquiries drop off before contact.",
        priority: "high",
      },
    ]);
  });

  it("drops a risk whose category has no domain rather than misfiling it", () => {
    expect(findingsFromRisks([{ title: "Something", category: "vibes" }])).toEqual([]);
  });

  it("skips an empty title, which could not be stored anyway", () => {
    expect(findingsFromRisks([{ title: "   ", category: "seo" }])).toEqual([]);
  });

  it("truncates to the column limits instead of being rejected on save", () => {
    const [finding] = findingsFromRisks([
      { title: "x".repeat(900), category: "seo", description: "y".repeat(400) },
    ]);
    expect(finding!.finding.length).toBeLessThanOrEqual(500);
    expect(finding!.baseline!.length).toBeLessThanOrEqual(120);
    expect(finding!.finding.endsWith("…")).toBe(true);
  });

  it("leaves the baseline null when there is no description", () => {
    const [finding] = findingsFromRisks([{ title: "Something", category: "seo" }]);
    expect(finding!.baseline).toBeNull();
  });
});

describe("findingsFromWeaknesses", () => {
  it("imports a weakness with its observed score as the baseline", () => {
    expect(
      findingsFromWeaknesses([
        { kind: "weakness", category: "lead_capture", title: "No enquiry form", observedScore: 22 },
      ]),
    ).toEqual([
      {
        domainKey: "sales",
        finding: "No enquiry form",
        baseline: "Observed 22/100",
        priority: "high",
      },
    ]);
  });

  it("NEVER files a strength as a finding — the ledger is a list of gaps", () => {
    expect(
      findingsFromWeaknesses([
        { kind: "strength", category: "seo", title: "Titles are unique", observedScore: 91 },
      ]),
    ).toEqual([]);
  });

  it("leaves the baseline null when no score was observed", () => {
    const [finding] = findingsFromWeaknesses([
      { kind: "weakness", category: "seo", title: "Thin content" },
    ]);
    expect(finding!.baseline).toBeNull();
    expect(finding!.priority).toBe("medium");
  });
});

describe("findingsFromLedger", () => {
  it("still reads the engine report's ledger shape", () => {
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

  it("drops a finding whose dimension has no domain", () => {
    expect(findingsFromLedger([{ title: "Market is growing", domain: "growth" }])).toEqual([]);
  });
});

describe("importedDiagnosis", () => {
  const report = {
    domainSummaries: [
      { category: "website", score: 62, confidence: 0.8 },
      { category: "analytics", score: 20, confidence: 0.5 },
      { category: "automation", score: null, confidence: 0.2 },
    ],
    risks: [
      { title: "No analytics on any page", category: "technical", severity: "critical", description: "Nothing is measured." },
    ],
  };
  const findings = {
    weaknesses: [
      { kind: "weakness", category: "analytics", title: "No analytics on any page", observedScore: 20 },
      { kind: "weakness", category: "lead_capture", title: "No enquiry form", observedScore: 30 },
    ],
    strengths: [{ kind: "strength", category: "seo", title: "Titles are unique", observedScore: 90 }],
  };

  it("imports the scores and findings a real assessment carries", () => {
    const result = importedDiagnosis({ report, findings });
    expect(result.scores).toEqual([
      { key: "web", score: 62, from: ["website"] },
      { key: "analytics", score: 20, from: ["analytics"] },
    ]);
    // Two weaknesses; the risk restates the first and is folded into it.
    expect(result.findings).toHaveLength(2);
    expect(result.summariesSeen).toBe(3);
  });

  it("deduplicates a problem a risk and a weakness both name", () => {
    const titles = importedDiagnosis({ report, findings }).findings.map((f) => f.finding);
    expect(titles.filter((t) => t === "No analytics on any page")).toHaveLength(1);
  });

  it("prefers the weakness's own domain over the risk's broader category", () => {
    // The weakness knows it is about analytics; the risk only says "technical".
    const analytics = importedDiagnosis({ report, findings }).findings.find(
      (f) => f.finding === "No analytics on any page",
    );
    expect(analytics!.domainKey).toBe("analytics");
  });

  it("reports zero summaries seen for an assessment with none, so the UI can say why", () => {
    const empty = importedDiagnosis({ report: { domainSummaries: [] }, findings: null });
    expect(empty.scores).toEqual([]);
    expect(empty.findings).toEqual([]);
    expect(empty.summariesSeen).toBe(0);
  });

  it("distinguishes 'nothing scored' from 'nothing mappable'", () => {
    const unmappable = importedDiagnosis({
      report: { domainSummaries: [{ category: "vibes", score: 50 }] },
      findings: null,
    });
    expect(unmappable.scores).toEqual([]);
    expect(unmappable.summariesSeen).toBe(1);
  });

  it("survives a missing report entirely", () => {
    expect(importedDiagnosis({ report: null })).toEqual({
      scores: [],
      findings: [],
      summariesSeen: 0,
    });
  });
});

describe("reconcileLedger", () => {
  const imported = (finding: string, domainKey = "web") =>
    ({ domainKey, finding, baseline: null, priority: "medium" }) as never;
  const row = (id: string, finding: string, source: "manual" | "import", domainKey = "web") =>
    ({ id, domainKey, finding, source }) as never;

  it("adds what the new scan reports and the ledger does not have", () => {
    const plan = reconcileLedger([], [imported("Thin content base")]);
    expect(plan.add).toHaveLength(1);
    expect(plan.remove).toEqual([]);
  });

  it("RETIRES an imported row the newer scan no longer reports", () => {
    // The defect this exists for: a Sales score of 81 sitting above
    // "Minimal social footprint · Observed 0/100" from an older scan.
    const plan = reconcileLedger(
      [row("f1", "Minimal social footprint", "import", "sales")],
      [imported("Weak lead capture", "sales")],
    );
    expect(plan.remove).toEqual(["f1"]);
    expect(plan.add).toHaveLength(1);
    expect(plan.keep).toBe(0);
  });

  it("NEVER retires a finding a person typed", () => {
    // No scan is evidence a hand-written finding stopped being true — no scan
    // is what put it there.
    const plan = reconcileLedger([row("f1", "Owner answers the phone at night", "manual")], []);
    expect(plan.remove).toEqual([]);
    expect(plan.keep).toBe(1);
  });

  it("keeps an imported row the newer scan still reports", () => {
    const plan = reconcileLedger(
      [row("f1", "Thin content base", "import")],
      [imported("Thin content base")],
    );
    expect(plan).toEqual({ add: [], remove: [], keep: 1 });
  });

  it("makes re-importing the same scan a no-op", () => {
    const existing = [row("f1", "Thin content base", "import"), row("f2", "Weak lead capture", "import", "sales")];
    const incoming = [imported("Thin content base"), imported("Weak lead capture", "sales")];
    expect(reconcileLedger(existing, incoming)).toEqual({ add: [], remove: [], keep: 2 });
  });

  it("matches on the pair, so the same words under another domain are a different finding", () => {
    const plan = reconcileLedger(
      [row("f1", "Thin content base", "import", "sales")],
      [imported("Thin content base", "web")],
    );
    expect(plan.remove).toEqual(["f1"]);
    expect(plan.add).toHaveLength(1);
  });

  it("ignores case and surrounding whitespace rather than churning the row", () => {
    const plan = reconcileLedger(
      [row("f1", "Thin Content Base", "import")],
      [imported("  thin content base  ")],
    );
    expect(plan).toEqual({ add: [], remove: [], keep: 1 });
  });

  it("does not re-add a finding a person already wrote by hand", () => {
    // Adding it again would file the same sentence twice under one domain.
    const plan = reconcileLedger([row("f1", "Thin content base", "manual")], [imported("Thin content base")]);
    expect(plan.add).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.keep).toBe(1);
  });

  it("retires every stale import at once", () => {
    const stale = ["a", "b", "c"].map((id, i) => row(id, `Old finding ${i}`, "import"));
    const plan = reconcileLedger([...stale, row("keep", "Typed", "manual")], []);
    expect(plan.remove).toEqual(["a", "b", "c"]);
    expect(plan.keep).toBe(1);
  });
});
