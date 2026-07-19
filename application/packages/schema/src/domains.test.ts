import { describe, it, expect } from "vitest";
import {
  DOMAIN_KEYS,
  DOMAIN_META,
  domainSchema,
  businessScanSchema,
  businessScanCreateInputSchema,
  scanFindingSchema,
  scanFindingCreateInputSchema,
  CORE_SURFACE_ENTITY_SCHEMAS,
} from "./domains.js";

const NOW = "2026-07-19T00:00:00.000Z";

describe("domain taxonomy", () => {
  it("has exactly the seven canonical domains, each with meta", () => {
    expect(DOMAIN_KEYS).toHaveLength(7);
    for (const k of DOMAIN_KEYS) {
      expect(DOMAIN_META[k].code).toBeTruthy();
      expect(DOMAIN_META[k].label).toBeTruthy();
    }
  });
});

describe("domainSchema", () => {
  const base = {
    id: "dom_1",
    clientId: "cli_1",
    key: "sales",
    status: "operating",
    baselineScore: 34,
    currentScore: 90,
    createdAt: NOW,
  };
  it("accepts a valid domain", () => {
    expect(domainSchema.safeParse(base).success).toBe(true);
  });
  it("rejects an unknown domain key and out-of-range score", () => {
    expect(domainSchema.safeParse({ ...base, key: "marketing" }).success).toBe(false);
    expect(domainSchema.safeParse({ ...base, currentScore: 140 }).success).toBe(false);
  });
});

describe("businessScanSchema + create input", () => {
  it("accepts a valid scan; bounds the Index 0..100", () => {
    const scan = { id: "scn_1", clientId: "cli_1", status: "diagnosed", baselineIndex: 34, targetIndex: 92, createdBy: "usr_1", createdAt: NOW };
    expect(businessScanSchema.safeParse(scan).success).toBe(true);
    expect(businessScanSchema.safeParse({ ...scan, baselineIndex: 120 }).success).toBe(false);
  });
  it("create input requires an org and defaults target to 92", () => {
    const r = businessScanCreateInputSchema.safeParse({ clientId: "cli_1" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.targetIndex).toBe(92);
    expect(businessScanCreateInputSchema.safeParse({ clientId: "" }).success).toBe(false);
  });
});

describe("scanFindingSchema + create input", () => {
  it("accepts a valid finding; requires text; defaults priority", () => {
    const f = { id: "fnd_1", scanId: "scn_1", clientId: "cli_1", domainKey: "web", finding: "Site converts at 1.2%", baseline: "1.2%", priority: "high", createdAt: NOW };
    expect(scanFindingSchema.safeParse(f).success).toBe(true);
    const ci = scanFindingCreateInputSchema.safeParse({ scanId: "scn_1", clientId: "cli_1", domainKey: "web", finding: "  x  " });
    expect(ci.success).toBe(true);
    if (ci.success) expect(ci.data.priority).toBe("medium");
    expect(scanFindingCreateInputSchema.safeParse({ scanId: "scn_1", clientId: "cli_1", domainKey: "web", finding: "" }).success).toBe(false);
  });
});

describe("registry", () => {
  it("registers the three core-surface entities", () => {
    expect(Object.keys(CORE_SURFACE_ENTITY_SCHEMAS).sort()).toEqual(["BusinessScan", "Domain", "ScanFinding"]);
  });
});
