import { describe, it, expect } from "vitest";
import type { Insight } from "@brightloop/schema";
import type { Actor } from "../capabilities.js";
import { AuthorizationError } from "../errors.js";
import {
  parseInsightListQuery,
  buildInsightQuery,
  insightsHref,
  activeInsightFilters,
  hasActiveInsightConstraints,
  availableInsightActions,
  buildInsightListView,
  buildInsightDetailView,
  assertInsightsRead,
  canWriteInsights,
  defaultInsightQuery,
  confidenceBand,
  confidencePercent,
  INSIGHT_PAGE_SIZE,
  type InsightListData,
  type InsightDetailData,
} from "./insights.js";

const owner: Actor = { userId: "u1", role: "owner", clientId: null };
const teamMember: Actor = { userId: "u2", role: "team_member", clientId: null };
const clientAdmin: Actor = { userId: "u3", role: "client_admin", clientId: "cli_A" };

function insight(overrides: Partial<Insight> = {}): Insight {
  return {
    id: "ins_1",
    clientId: "cli_A",
    signalId: "sig_1",
    summary: "Delivery cost is structural, not seasonal",
    detail: "Three quarters of overruns trace to the same vendor.",
    status: "generated",
    evidence: [],
    confidence: 0.8,
    createdBy: "usr_o",
    createdAt: "2026-07-10T10:00:00.000Z",
    ...overrides,
  };
}

describe("parseInsightListQuery (fail-safe URL parsing)", () => {
  it("defaults to the open workspace", () => {
    expect(parseInsightListQuery({})).toEqual(defaultInsightQuery());
  });
  it("accepts canonical values", () => {
    const q = parseInsightListQuery({ status: "endorsed", sort: "confidence", q: "  vendor  ", page: "3", client: "cli_A" });
    expect(q).toEqual({ status: "endorsed", sort: "confidence", search: "vendor", page: 3, clientId: "cli_A" });
  });
  it("falls back on crafted/invalid values (never throws)", () => {
    const q = parseInsightListQuery({ status: "; DROP TABLE", sort: "1=1", page: "banana", client: "x".repeat(200) });
    expect(q.status).toBe("open");
    expect(q.sort).toBe("newest");
    expect(q.page).toBe(1);
    expect(q.clientId).toBeNull();
  });
  it("caps search length", () => {
    expect(parseInsightListQuery({ q: "a".repeat(500) }).search).toHaveLength(100);
  });
});

describe("query serialization", () => {
  it("omits defaults for clean shareable URLs", () => {
    expect(buildInsightQuery(defaultInsightQuery())).toBe("");
    expect(insightsHref(defaultInsightQuery())).toBe("/admin/insights");
  });
  it("round-trips non-default state", () => {
    const q = { status: "dismissed" as const, sort: "confidence" as const, search: "x", page: 2, clientId: "cli_B" };
    const parsed = parseInsightListQuery(Object.fromEntries(new URLSearchParams(buildInsightQuery(q))));
    expect(parsed).toEqual(q);
  });
  it("reports active constraints + chips", () => {
    const q = { status: "endorsed" as const, sort: "newest" as const, search: "cost", page: 1, clientId: null };
    expect(hasActiveInsightConstraints(q)).toBe(true);
    const chips = activeInsightFilters(q);
    expect(chips.map((c) => c.key).sort()).toEqual(["q", "status"]);
    // clearing a chip resets to page 1 and drops just that constraint
    expect(chips.find((c) => c.key === "status")?.clearedQuery.status).toBe("open");
  });
});

describe("confidence presentation", () => {
  it("buckets confidence into bands", () => {
    expect(confidenceBand(null)).toBe("unrated");
    expect(confidenceBand(0.1)).toBe("low");
    expect(confidenceBand(0.5)).toBe("medium");
    expect(confidenceBand(0.9)).toBe("high");
  });
  it("maps confidence to an integer percent, clamped, null when unrated", () => {
    expect(confidencePercent(null)).toBeNull();
    expect(confidencePercent(0.834)).toBe(83);
    expect(confidencePercent(1.4)).toBe(100);
    expect(confidencePercent(-1)).toBe(0);
  });
});

describe("availableInsightActions (lifecycle guard)", () => {
  it("offers only legal transitions per state", () => {
    expect(availableInsightActions("generated", true).map((a) => a.to)).toEqual(["endorsed", "dismissed"]);
  });
  it("never offers actions on a terminal insight", () => {
    expect(availableInsightActions("endorsed", true)).toEqual([]);
    expect(availableInsightActions("dismissed", true)).toEqual([]);
  });
  it("offers nothing to a read-only actor", () => {
    expect(availableInsightActions("generated", false)).toEqual([]);
  });
  it("marks dismiss as a confirm-required danger action", () => {
    const dismiss = availableInsightActions("generated", true).find((a) => a.to === "dismissed");
    expect(dismiss?.confirm).toBe(true);
    expect(dismiss?.intent).toBe("danger");
    const endorse = availableInsightActions("generated", true).find((a) => a.to === "endorsed");
    expect(endorse?.confirm).toBe(false);
    expect(endorse?.intent).toBe("primary");
  });
});

describe("authorization helpers", () => {
  it("permits internal roles to read; team_member/owner can write", () => {
    expect(() => assertInsightsRead(owner)).not.toThrow();
    expect(() => assertInsightsRead(teamMember)).not.toThrow();
    expect(canWriteInsights(teamMember)).toBe(true);
    expect(canWriteInsights(owner)).toBe(true);
  });
  it("denies a client role read (insights are internal-only)", () => {
    expect(() => assertInsightsRead(clientAdmin)).toThrow(AuthorizationError);
    expect(canWriteInsights(clientAdmin)).toBe(false);
  });
});

describe("buildInsightListView", () => {
  const data: InsightListData = {
    insights: [
      insight({ id: "ins_1", status: "endorsed", confidence: 0.9 }),
      insight({ id: "ins_2", clientId: "cli_B", signalId: "sig_2", createdBy: null, confidence: null }),
    ],
    total: 42,
    orgNames: { cli_A: "Acme", cli_B: "Globex" },
    actorNames: { usr_o: "Owen" },
    signalTitles: { sig_1: "Delivery slipped", sig_2: "Churn ticked up" },
  };
  it("maps rows with org, status, confidence, parent signal and href", () => {
    const view = buildInsightListView(data, defaultInsightQuery());
    expect(view.rows[0]).toMatchObject({
      id: "ins_1",
      orgName: "Acme",
      statusLabel: "Endorsed",
      href: "/admin/insights/ins_1",
      createdByName: "Owen",
      signalTitle: "Delivery slipped",
      signalHref: "/admin/signals/sig_1",
      confidencePercent: 90,
      confidenceBand: "high",
    });
    expect(view.rows[1]).toMatchObject({
      orgName: "Globex",
      createdByName: null,
      signalTitle: "Churn ticked up",
      confidence: null,
      confidencePercent: null,
      confidenceBand: "unrated",
    });
  });
  it("computes bounded pagination", () => {
    const view = buildInsightListView(data, { ...defaultInsightQuery(), page: 2 });
    expect(view.pageSize).toBe(INSIGHT_PAGE_SIZE);
    expect(view.pageCount).toBe(Math.ceil(42 / INSIGHT_PAGE_SIZE));
    expect(view.total).toBe(42);
  });
});

describe("buildInsightDetailView", () => {
  it("builds a reverse-chronological timeline, legal actions, and the parent-signal link", () => {
    const detail: InsightDetailData = {
      insight: insight({ status: "generated" }),
      orgName: "Acme",
      createdByName: "Owen",
      signalTitle: "Delivery slipped",
      signalStatus: "validated",
      transitions: [],
    };
    const view = buildInsightDetailView(detail, true);
    expect(view.timeline).toHaveLength(1); // just creation
    expect(view.timeline[0]?.kind).toBe("created");
    expect(view.actions.map((a) => a.to)).toEqual(["endorsed", "dismissed"]);
    expect(view.isTerminal).toBe(false);
    expect(view.statusLabel).toBe("Generated");
    expect(view.signalHref).toBe("/admin/signals/sig_1");
    expect(view.signalTitle).toBe("Delivery slipped");
    expect(view.confidencePercent).toBe(80);
  });
  it("shows no actions for an endorsed (terminal) insight", () => {
    const detail: InsightDetailData = {
      insight: insight({ status: "endorsed" }),
      orgName: "Acme",
      createdByName: null,
      signalTitle: "Delivery slipped",
      signalStatus: "prioritized",
      transitions: [
        { from: "generated", to: "endorsed", actorName: "Owen", at: "2026-07-11T09:00:00.000Z", reason: "clear" },
      ],
    };
    const view = buildInsightDetailView(detail, true);
    expect(view.actions).toEqual([]);
    expect(view.isTerminal).toBe(true);
    expect(view.timeline).toHaveLength(2);
    expect(view.timeline[0]?.kind).toBe("transition"); // newest first
    expect(view.timeline[1]?.kind).toBe("created");
  });
});
