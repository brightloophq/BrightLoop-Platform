import { describe, it, expect } from "vitest";
import type { Actor } from "../capabilities.js";
import { assertCapability } from "../capabilities.js";
import { AuthorizationError } from "../errors.js";
import {
  resolveDashboardScope,
  assertDashboardRead,
  buildDashboardView,
  countStaleRecommendations,
  countCriticalOpenRisks,
  tallyByKey,
  sumBuckets,
  ACTIVITY_LIMIT,
  type DashboardSnapshot,
} from "./dashboard.js";

const owner: Actor = { userId: "usr_o", role: "owner", clientId: null };
const teamMember: Actor = { userId: "usr_t", role: "team_member", clientId: null };
const clientAdmin: Actor = { userId: "usr_c", role: "client_admin", clientId: "cli_A" };
const clientNoOrg: Actor = { userId: "usr_x", role: "client_admin", clientId: null };

function emptySnapshot(): DashboardSnapshot {
  return {
    businessHealth: null,
    transformationIndex: null,
    orgsTracked: 0,
    signals: {},
    insights: {},
    recommendations: {},
    recommendationsStale: 0,
    approvals: {},
    moves: {},
    executions: {},
    measurements: 0,
    learnings: 0,
    risks: { total: 0, criticalOpen: 0 },
    knowledge: 0,
    activity: [],
  };
}

describe("resolveDashboardScope (tenant isolation)", () => {
  it("scopes a client role to its own organization", () => {
    expect(resolveDashboardScope(clientAdmin)).toEqual({ kind: "organization", clientId: "cli_A" });
  });
  it("gives internal roles the portfolio scope", () => {
    expect(resolveDashboardScope(owner)).toEqual({ kind: "portfolio" });
    expect(resolveDashboardScope(teamMember)).toEqual({ kind: "portfolio" });
  });
  it("denies a malformed client actor with no org id", () => {
    expect(() => resolveDashboardScope(clientNoOrg)).toThrow();
  });
});

describe("assertDashboardRead (authorization)", () => {
  it("allows internal + client roles that hold the read capability", () => {
    expect(() => assertDashboardRead(owner)).not.toThrow();
    expect(() => assertDashboardRead(teamMember)).not.toThrow();
    expect(() => assertDashboardRead(clientAdmin)).not.toThrow();
  });
  it("fails closed: the capability system throws AuthorizationError for a missing cap", () => {
    // The guard delegates to assertCapability; prove the mechanism it relies on
    // denies a role that lacks a capability (team_member has no approve authority).
    expect(() => assertCapability(teamMember, "transformation.approve")).toThrow(AuthorizationError);
  });
});

describe("buildDashboardView", () => {
  const scope = { kind: "portfolio" } as const;

  it("derives the executive metrics from a populated snapshot", () => {
    const snap: DashboardSnapshot = {
      ...emptySnapshot(),
      businessHealth: { score: 72 },
      transformationIndex: { value: 63, delta: 4 },
      signals: { detected: 3, validated: 2, prioritized: 1, archived: 5 }, // open = 6
      insights: { generated: 4, endorsed: 2, dismissed: 9 }, // active = 6
      recommendations: { proposed: 2, adjusted: 1, accepted: 7, rejected: 3 }, // active = 3
      approvals: { pending: 5, granted: 8, denied: 1 },
      moves: { approved: 2, executing: 1, completed: 4, measured: 2, draft: 3 }, // inProgress 3, completed 6
    };
    const view = buildDashboardView(snap, scope);
    const metric = (k: string) => view.metrics.find((m) => m.key === k)?.value;
    expect(metric("health")).toBe(72);
    expect(metric("index")).toBe(63);
    expect(metric("open-signals")).toBe(6);
    expect(metric("insights")).toBe(6);
    expect(metric("recommendations")).toBe(3);
    expect(metric("awaiting-approval")).toBe(5);
    expect(metric("moves-in-progress")).toBe(3);
    expect(metric("moves-completed")).toBe(6);
    expect(view.isEmpty).toBe(false);
  });

  it("leaves health/index null (no misleading zeros) and reports empty", () => {
    const view = buildDashboardView(emptySnapshot(), scope);
    expect(view.metrics.find((m) => m.key === "health")?.value).toBeNull();
    expect(view.metrics.find((m) => m.key === "index")?.value).toBeNull();
    expect(view.metrics.find((m) => m.key === "open-signals")?.value).toBe(0);
    expect(view.isEmpty).toBe(true);
    expect(view.attentionClear).toBe(true);
    expect(view.attention).toHaveLength(0);
  });

  it("surfaces only non-zero attention items", () => {
    const snap: DashboardSnapshot = {
      ...emptySnapshot(),
      approvals: { pending: 2 },
      executions: { failed: 1, succeeded: 4 },
      recommendationsStale: 3,
      risks: { total: 5, criticalOpen: 0 },
    };
    const view = buildDashboardView(snap, scope);
    const keys = view.attention.map((a) => a.key).sort();
    expect(keys).toEqual(["blocked-executions", "pending-approvals", "stale-recommendations"]);
    expect(view.attention.every((a) => a.count > 0)).toBe(true);
    expect(view.attentionClear).toBe(false);
  });

  it("orders activity newest-first and caps the feed", () => {
    const many = Array.from({ length: ACTIVITY_LIMIT + 5 }, (_, i) => ({
      id: `t${i}`,
      entity: "signal",
      entityId: `sig${i}`,
      from: "detected",
      to: "validated",
      actor: "usr_o",
      at: new Date(2026, 0, 1 + i).toISOString(),
    }));
    const shuffled = [many[3]!, many[10]!, many[1]!, ...many];
    const view = buildDashboardView({ ...emptySnapshot(), activity: shuffled }, scope);
    expect(view.activity).toHaveLength(ACTIVITY_LIMIT);
    for (let i = 1; i < view.activity.length; i++) {
      expect(Date.parse(view.activity[i - 1]!.at)).toBeGreaterThanOrEqual(Date.parse(view.activity[i]!.at));
    }
  });
});

describe("pure count helpers", () => {
  const now = Date.UTC(2026, 5, 1);
  const old = new Date(Date.UTC(2026, 4, 1)).toISOString(); // ~31 days before
  const recent = new Date(Date.UTC(2026, 4, 28)).toISOString(); // ~4 days before

  it("counts only open recommendations older than the threshold", () => {
    const rows = [
      { status: "proposed", createdAt: old }, // stale
      { status: "adjusted", createdAt: old }, // stale
      { status: "proposed", createdAt: recent }, // fresh
      { status: "accepted", createdAt: old }, // resolved → not stale
    ];
    expect(countStaleRecommendations(rows, now)).toBe(2);
  });

  it("counts only critical, unresolved risks", () => {
    const rows = [
      { severity: "critical", status: "identified" }, // open
      { severity: "critical", status: "mitigating" }, // open
      { severity: "critical", status: "mitigated" }, // resolved
      { severity: "high", status: "identified" }, // not critical
    ];
    expect(countCriticalOpenRisks(rows)).toBe(2);
  });

  it("tallies and sums buckets", () => {
    const map = tallyByKey([{ s: "a" }, { s: "a" }, { s: "b" }], "s");
    expect(map).toEqual({ a: 2, b: 1 });
    expect(sumBuckets(map)).toBe(3);
    expect(sumBuckets(map, ["a"])).toBe(2);
    expect(sumBuckets(map, ["z"])).toBe(0);
  });
});
