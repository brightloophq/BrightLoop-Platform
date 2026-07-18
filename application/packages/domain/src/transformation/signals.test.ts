import { describe, it, expect } from "vitest";
import type { Signal } from "@brightloop/schema";
import type { Actor } from "../capabilities.js";
import { AuthorizationError } from "../errors.js";
import {
  parseSignalListQuery,
  buildSignalQuery,
  signalsHref,
  activeSignalFilters,
  hasActiveConstraints,
  availableSignalActions,
  buildSignalListView,
  buildSignalDetailView,
  assertSignalsRead,
  canWriteSignals,
  defaultSignalQuery,
  SIGNAL_PAGE_SIZE,
  type SignalListData,
  type SignalDetailData,
} from "./signals.js";

const owner: Actor = { userId: "u1", role: "owner", clientId: null };
const teamMember: Actor = { userId: "u2", role: "team_member", clientId: null };
const clientAdmin: Actor = { userId: "u3", role: "client_admin", clientId: "cli_A" };

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig_1",
    clientId: "cli_A",
    title: "Delivery slipped",
    detail: "Cycle time up 20%",
    status: "detected",
    sourceRef: "metric:cycle_time",
    evidence: [],
    createdBy: "usr_o",
    createdAt: "2026-07-10T10:00:00.000Z",
    ...overrides,
  };
}

describe("parseSignalListQuery (fail-safe URL parsing)", () => {
  it("defaults to the open workspace", () => {
    expect(parseSignalListQuery({})).toEqual(defaultSignalQuery());
  });
  it("accepts canonical values", () => {
    const q = parseSignalListQuery({ status: "prioritized", sort: "oldest", q: "  bottleneck  ", page: "3", client: "cli_A" });
    expect(q).toEqual({ status: "prioritized", sort: "oldest", search: "bottleneck", page: 3, clientId: "cli_A" });
  });
  it("falls back on crafted/invalid values (never throws)", () => {
    const q = parseSignalListQuery({ status: "; DROP TABLE", sort: "1=1", page: "banana", client: "x".repeat(200) });
    expect(q.status).toBe("open");
    expect(q.sort).toBe("newest");
    expect(q.page).toBe(1);
    expect(q.clientId).toBeNull();
  });
  it("caps search length", () => {
    expect(parseSignalListQuery({ q: "a".repeat(500) }).search).toHaveLength(100);
  });
});

describe("query serialization", () => {
  it("omits defaults for clean shareable URLs", () => {
    expect(buildSignalQuery(defaultSignalQuery())).toBe("");
    expect(signalsHref(defaultSignalQuery())).toBe("/admin/signals");
  });
  it("round-trips non-default state", () => {
    const q = { status: "archived" as const, sort: "title" as const, search: "x", page: 2, clientId: "cli_B" };
    const parsed = parseSignalListQuery(Object.fromEntries(new URLSearchParams(buildSignalQuery(q))));
    expect(parsed).toEqual(q);
  });
  it("reports active constraints + chips", () => {
    const q = { status: "archived" as const, sort: "newest" as const, search: "cost", page: 1, clientId: null };
    expect(hasActiveConstraints(q)).toBe(true);
    const chips = activeSignalFilters(q);
    expect(chips.map((c) => c.key).sort()).toEqual(["q", "status"]);
    // clearing a chip resets to page 1 and drops just that constraint
    expect(chips.find((c) => c.key === "status")?.clearedQuery.status).toBe("open");
  });
});

describe("availableSignalActions (lifecycle guard)", () => {
  it("offers only legal transitions per state", () => {
    expect(availableSignalActions("detected", true).map((a) => a.to)).toEqual(["validated", "archived"]);
    expect(availableSignalActions("validated", true).map((a) => a.to)).toEqual(["prioritized", "archived"]);
    expect(availableSignalActions("prioritized", true).map((a) => a.to)).toEqual(["archived"]);
  });
  it("never offers actions on a terminal (archived) signal", () => {
    expect(availableSignalActions("archived", true)).toEqual([]);
  });
  it("offers nothing to a read-only actor", () => {
    expect(availableSignalActions("detected", false)).toEqual([]);
  });
  it("marks archive as a confirm-required danger action", () => {
    const archive = availableSignalActions("prioritized", true).find((a) => a.to === "archived");
    expect(archive?.confirm).toBe(true);
    expect(archive?.intent).toBe("danger");
  });
});

describe("authorization helpers", () => {
  it("permits internal roles to read; team_member/owner can write", () => {
    expect(() => assertSignalsRead(owner)).not.toThrow();
    expect(() => assertSignalsRead(teamMember)).not.toThrow();
    expect(canWriteSignals(teamMember)).toBe(true);
    expect(canWriteSignals(owner)).toBe(true);
  });
  it("denies a client role read (signals are internal-only)", () => {
    expect(() => assertSignalsRead(clientAdmin)).toThrow(AuthorizationError);
    expect(canWriteSignals(clientAdmin)).toBe(false);
  });
});

describe("buildSignalListView", () => {
  const data: SignalListData = {
    signals: [signal({ id: "sig_1", status: "prioritized" }), signal({ id: "sig_2", clientId: "cli_B", createdBy: null })],
    total: 42,
    orgNames: { cli_A: "Acme", cli_B: "Globex" },
    actorNames: { usr_o: "Owen" },
  };
  it("maps rows with org name, status label, tone and href", () => {
    const view = buildSignalListView(data, defaultSignalQuery());
    expect(view.rows[0]).toMatchObject({ id: "sig_1", orgName: "Acme", statusLabel: "Prioritized", href: "/admin/signals/sig_1", createdByName: "Owen" });
    expect(view.rows[1]).toMatchObject({ orgName: "Globex", createdByName: null });
  });
  it("computes bounded pagination", () => {
    const view = buildSignalListView(data, { ...defaultSignalQuery(), page: 2 });
    expect(view.pageSize).toBe(SIGNAL_PAGE_SIZE);
    expect(view.pageCount).toBe(Math.ceil(42 / SIGNAL_PAGE_SIZE));
    expect(view.total).toBe(42);
  });
});

describe("buildSignalDetailView", () => {
  it("builds a reverse-chronological timeline including the creation event, and legal actions", () => {
    const detail: SignalDetailData = {
      signal: signal({ status: "validated" }),
      orgName: "Acme",
      createdByName: "Owen",
      transitions: [
        { from: "detected", to: "validated", actorName: "Owen", at: "2026-07-11T09:00:00.000Z", reason: "confirmed" },
      ],
    };
    const view = buildSignalDetailView(detail, true);
    expect(view.timeline).toHaveLength(2);
    expect(view.timeline[0]?.kind).toBe("transition"); // newest first
    expect(view.timeline[1]?.kind).toBe("created");
    expect(view.actions.map((a) => a.to)).toEqual(["prioritized", "archived"]);
    expect(view.isTerminal).toBe(false);
    expect(view.statusLabel).toBe("Validated");
  });
  it("shows no actions for an archived signal", () => {
    const detail: SignalDetailData = {
      signal: signal({ status: "archived" }),
      orgName: "Acme",
      createdByName: null,
      transitions: [],
    };
    const view = buildSignalDetailView(detail, true);
    expect(view.actions).toEqual([]);
    expect(view.isTerminal).toBe(true);
    expect(view.timeline).toHaveLength(1); // just creation
  });
});
