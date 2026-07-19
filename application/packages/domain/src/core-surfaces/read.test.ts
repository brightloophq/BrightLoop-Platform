import { describe, it, expect } from "vitest";
import type { Domain, BusinessScan, ScanFinding } from "@brightloop/schema";
import type { Actor } from "../capabilities.js";
import { AuthorizationError } from "../errors.js";
import {
  buildSystemMapView,
  buildBusinessScanView,
  buildActivationView,
  buildPortfolioSystemMapView,
  assertCoreSurfacesRead,
  canWriteScans,
  canActivate,
} from "./read.js";

const NOW = "2026-07-19T00:00:00.000Z";
const owner: Actor = { userId: "u1", role: "owner", clientId: null };
const teamMember: Actor = { userId: "u2", role: "team_member", clientId: null };
const clientAdmin: Actor = { userId: "u3", role: "client_admin", clientId: "cli_A" };

function domain(key: Domain["key"], over: Partial<Domain> = {}): Domain {
  return { id: `dom_${key}`, clientId: "cli_A", key, status: "not_operating", baselineScore: null, currentScore: null, createdAt: NOW, ...over };
}

describe("buildSystemMapView (deterministic, always 7 nodes)", () => {
  it("returns the seven canonical domains in order, unlit by default", () => {
    const v = buildSystemMapView([]);
    expect(v.nodes.map((n) => n.key)).toEqual(["web", "sales", "crm", "operations", "delivery", "analytics", "ai"]);
    expect(v.nodes.every((n) => !n.lit && n.status === "not_operating" && n.score === null)).toBe(true);
    expect(v.operatingCount).toBe(0);
    expect(v.index.value).toBe(0);
  });
  it("lights operating domains and computes the composite index from scores", () => {
    const v = buildSystemMapView(
      [domain("sales", { status: "operating", currentScore: 90 }), domain("web", { status: "operating", currentScore: 82 })],
      { target: 92, delta: 4 },
    );
    expect(v.operatingCount).toBe(2);
    expect(v.nodes.find((n) => n.key === "sales")?.lit).toBe(true);
    expect(v.index.value).toBe(86); // round((90+82)/2)
    expect(v.index.target).toBe(92);
    expect(v.index.pct).toBeCloseTo(86 / 92, 3);
    expect(v.index.delta).toBe(4);
  });
  it("reads the baseline basis when asked", () => {
    const v = buildSystemMapView([domain("crm", { baselineScore: 30, currentScore: 88 })], { basis: "baseline" });
    expect(v.index.value).toBe(30);
  });
  it("is deterministic (same input → same output)", () => {
    const d = [domain("ai", { status: "operating", currentScore: 95 })];
    expect(buildSystemMapView(d)).toEqual(buildSystemMapView(d));
  });
});

describe("buildBusinessScanView", () => {
  const scan: BusinessScan = { id: "scn_1", clientId: "cli_A", status: "diagnosed", baselineIndex: 34, targetIndex: 92, createdBy: "u1", createdAt: NOW };
  function finding(over: Partial<ScanFinding>): ScanFinding {
    return { id: "fnd", scanId: "scn_1", clientId: "cli_A", domainKey: "web", finding: "x", baseline: null, priority: "medium", createdAt: NOW, ...over };
  }
  it("orders findings high→low and counts non-low gaps", () => {
    const v = buildBusinessScanView(scan, [], [finding({ priority: "low" }), finding({ priority: "high" }), finding({ priority: "medium" })]);
    expect(v.findings.map((f) => f.priority)).toEqual(["high", "medium", "low"]);
    expect(v.gapCount).toBe(2);
    expect(v.systemMap.index.target).toBe(92);
  });
});

describe("buildActivationView", () => {
  it("reports assembly steps and completeness", () => {
    const all = (["web", "sales", "crm", "operations", "delivery", "analytics", "ai"] as const).map((k) => domain(k, { status: "operating", currentScore: 90 }));
    const v = buildActivationView(all);
    expect(v.total).toBe(7);
    expect(v.operatingCount).toBe(7);
    expect(v.complete).toBe(true);
    expect(v.steps.every((s) => s.live)).toBe(true);
  });
  it("is incomplete when a domain is not operating", () => {
    const v = buildActivationView([domain("sales", { status: "assembling" })]);
    expect(v.complete).toBe(false);
    expect(v.operatingCount).toBe(0);
  });
});

describe("buildPortfolioSystemMapView (Console multi-client scope)", () => {
  it("aggregates a domain's score across clients (mean) and majority-operating status", () => {
    const rows: Domain[] = [
      { ...domain("sales", { clientId: "cli_A", status: "operating", currentScore: 80 }) },
      { ...domain("sales", { clientId: "cli_B", status: "operating", currentScore: 90 }) },
      { ...domain("sales", { clientId: "cli_C", status: "not_operating", currentScore: null }) },
    ];
    const v = buildPortfolioSystemMapView(rows);
    const sales = v.nodes.find((n) => n.key === "sales")!;
    expect(sales.score).toBe(85); // mean of 80,90
    expect(sales.lit).toBe(true); // 2 of 3 operating = majority
  });
  it("is deterministic and keeps all seven nodes", () => {
    const rows = [domain("web", { clientId: "cli_A", status: "operating", currentScore: 70 })];
    expect(buildPortfolioSystemMapView(rows)).toEqual(buildPortfolioSystemMapView(rows));
    expect(buildPortfolioSystemMapView(rows).nodes).toHaveLength(7);
  });
});

describe("authorization helpers", () => {
  it("permits internal read; owner/team_member may scan + activate", () => {
    expect(() => assertCoreSurfacesRead(owner)).not.toThrow();
    expect(canWriteScans(teamMember)).toBe(true);
    expect(canActivate(owner)).toBe(true);
  });
  it("denies a client role (internal-only)", () => {
    expect(() => assertCoreSurfacesRead(clientAdmin)).toThrow(AuthorizationError);
    expect(canWriteScans(clientAdmin)).toBe(false);
  });
});
