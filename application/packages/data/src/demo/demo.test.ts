import { describe, it, expect } from "vitest";
import { DOMAIN_KEYS } from "@brightloop/schema";
import { buildDashboardView, type CoreSurfaceRepository } from "@brightloop/domain";
import {
  DEMO_ORGS,
  demoAllDomains,
  demoDomainsFor,
  demoOrg,
  demoScanFor,
  demoFindingsForScan,
  demoPortfolioSnapshot,
  demoOrgSnapshot,
  demoSignalRows,
  demoSignalList,
  demoSignalSummary,
  demoSignalDetail,
  demoAnalytics,
} from "./demo.dataset.js";
import {
  DemoCoreSurfaceRepository,
  DemoSignalsRepository,
  DemoTransformationDashboardRepository,
  DemoModeError,
} from "./demo.repositories.js";
import type { SignalListQuery } from "@brightloop/domain";

const NOW = Date.parse("2026-08-04T12:00:00.000Z");

const q = (over: Partial<SignalListQuery> = {}): SignalListQuery => ({
  status: "open",
  search: "",
  sort: "newest",
  page: 1,
  clientId: null,
  ...over,
});

describe("demo dataset — orgs", () => {
  it("uses the illustrative brief organizations (no Lorem/placeholder names)", () => {
    const names = DEMO_ORGS.map((o) => o.name);
    expect(names).toContain("Onixus");
    expect(names).toContain("Verdant Fields Co.");
    expect(names).toContain("Acme Construction");
    expect(names).toContain("Kingston Logistics");
    expect(names).toContain("Green Horizon");
    for (const n of names) expect(n).not.toMatch(/lorem|ipsum|john doe|placeholder/i);
  });
});

describe("demo domains (System Map input)", () => {
  it("returns 7 domains per org across every org", () => {
    const all = demoAllDomains();
    expect(all).toHaveLength(DEMO_ORGS.length * DOMAIN_KEYS.length);
    for (const d of all) {
      expect(DOMAIN_KEYS).toContain(d.key);
      expect(["not_operating", "assembling", "operating"]).toContain(d.status);
    }
  });

  it("filters to a single org and returns nothing for an unknown id", () => {
    expect(demoDomainsFor("demo_onixus")).toHaveLength(DOMAIN_KEYS.length);
    expect(demoDomainsFor("nope")).toHaveLength(0);
  });

  it("operating domains carry a current score (lit nodes are scored)", () => {
    for (const d of demoAllDomains()) {
      if (d.status === "operating") expect(typeof d.currentScore).toBe("number");
    }
  });
});

describe("demo scans + findings", () => {
  it("produces a scan per org with a findings ledger", () => {
    const scan = demoScanFor("demo_verdant");
    expect(scan).not.toBeNull();
    expect(scan!.id).toBe("sc_demo_verdant");
    const findings = demoFindingsForScan(scan!.id);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.scanId).toBe(scan!.id);
      expect(f.clientId).toBe("demo_verdant");
      expect(["low", "medium", "high"]).toContain(f.priority);
    }
  });

  it("returns null / empty for unknown ids", () => {
    expect(demoScanFor("nope")).toBeNull();
    expect(demoFindingsForScan("sc_nope")).toHaveLength(0);
  });
});

describe("portfolio snapshot", () => {
  const snap = demoPortfolioSnapshot(NOW);

  it("aggregates health/index and tracks every org", () => {
    expect(snap.orgsTracked).toBe(DEMO_ORGS.length);
    expect(snap.businessHealth!.score).toBeGreaterThan(0);
    expect(snap.businessHealth!.score).toBeLessThanOrEqual(100);
    expect(snap.transformationIndex!.value).toBeGreaterThan(0);
  });

  it("sums pipeline counts across orgs", () => {
    const expectedDetected = DEMO_ORGS.reduce((a, o) => a + (o.signals.detected ?? 0), 0);
    expect(snap.signals.detected).toBe(expectedDetected);
    const expectedStale = DEMO_ORGS.reduce((a, o) => a + o.recommendationsStale, 0);
    expect(snap.recommendationsStale).toBe(expectedStale);
  });

  it("orders activity newest-first with timestamps at or before now", () => {
    expect(snap.activity.length).toBeGreaterThan(0);
    for (let i = 1; i < snap.activity.length; i++) {
      expect(Date.parse(snap.activity[i - 1]!.at)).toBeGreaterThanOrEqual(Date.parse(snap.activity[i]!.at));
    }
    for (const a of snap.activity) expect(Date.parse(a.at)).toBeLessThanOrEqual(NOW);
  });

  it("is deterministic for a fixed now", () => {
    expect(demoPortfolioSnapshot(NOW)).toEqual(snap);
  });
});

describe("demo data through the real dashboard read model (keystone)", () => {
  it("produces a fully-alive, non-empty portfolio Console", () => {
    const view = buildDashboardView(demoPortfolioSnapshot(NOW), { kind: "portfolio" });
    expect(view.isEmpty).toBe(false);
    // Hero metrics (health + index) are real numbers, not the null empty-state.
    expect(view.metrics.find((m) => m.key === "health")!.value).not.toBeNull();
    expect(view.metrics.find((m) => m.key === "index")!.value).not.toBeNull();
    // The transformation loop has movement at every stage.
    expect(view.pipeline.every((s) => s.count > 0)).toBe(true);
    // Activity feed and attention list are populated.
    expect(view.activity.length).toBeGreaterThan(0);
    expect(view.attention.length).toBeGreaterThan(0);
  });
});

describe("org snapshot", () => {
  it("mirrors the org profile for a known id", () => {
    const org = demoOrg("demo_onixus")!;
    const snap = demoOrgSnapshot("demo_onixus", NOW);
    expect(snap.businessHealth!.score).toBe(org.health);
    expect(snap.transformationIndex!.value).toBe(org.index.value);
    expect(snap.orgsTracked).toBeNull();
  });

  it("returns an empty (not fabricated) snapshot for an unknown id", () => {
    const snap = demoOrgSnapshot("nope", NOW);
    expect(snap.businessHealth).toBeNull();
    expect(snap.transformationIndex).toBeNull();
    expect(snap.activity).toHaveLength(0);
  });
});

describe("DemoTransformationDashboardRepository", () => {
  const repo = new DemoTransformationDashboardRepository(() => NOW);

  it("reads the portfolio snapshot for portfolio scope", async () => {
    const snap = await repo.read({ kind: "portfolio" });
    expect(snap.orgsTracked).toBe(DEMO_ORGS.length);
  });

  it("reads a single org for organization scope", async () => {
    const snap = await repo.read({ kind: "organization", clientId: "demo_onixus" });
    expect(snap.businessHealth!.score).toBe(demoOrg("demo_onixus")!.health);
  });
});

describe("demo Signals (real module)", () => {
  it("lists open signals by default, newest-first, excluding archived", () => {
    const data = demoSignalList(q(), NOW);
    expect(data.signals.length).toBeGreaterThan(0);
    expect(data.signals.every((s) => s.status !== "archived")).toBe(true);
    for (let i = 1; i < data.signals.length; i++) {
      expect(Date.parse(data.signals[i - 1]!.createdAt)).toBeGreaterThanOrEqual(
        Date.parse(data.signals[i]!.createdAt),
      );
    }
    expect(data.total).toBe(data.signals.length);
    expect(Object.keys(data.orgNames).length).toBe(DEMO_ORGS.length);
  });

  it("filters by status, org, and search term", () => {
    expect(demoSignalList(q({ status: "prioritized" }), NOW).signals.every((s) => s.status === "prioritized")).toBe(true);
    expect(demoSignalList(q({ status: "all", clientId: "demo_onixus" }), NOW).signals.every((s) => s.clientId === "demo_onixus")).toBe(true);
    const searched = demoSignalList(q({ status: "all", search: "route" }), NOW);
    expect(searched.signals.length).toBeGreaterThan(0);
    expect(searched.signals.some((s) => /route/i.test(s.title) || /route/i.test(s.detail ?? ""))).toBe(true);
  });

  it("sorts by title and by oldest", () => {
    const byTitle = demoSignalList(q({ status: "all", sort: "title" }), NOW).signals;
    const titles = byTitle.map((s) => s.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    const oldest = demoSignalList(q({ status: "all", sort: "oldest" }), NOW).signals;
    for (let i = 1; i < oldest.length; i++) {
      expect(Date.parse(oldest[i]!.createdAt)).toBeGreaterThanOrEqual(Date.parse(oldest[i - 1]!.createdAt));
    }
  });

  it("summarizes counts consistently with the rows", () => {
    const summary = demoSignalSummary(NOW, null);
    const all = demoSignalRows(NOW);
    expect(summary.open).toBe(all.filter((s) => s.status !== "archived").length);
    expect(summary.archived).toBe(all.filter((s) => s.status === "archived").length);
    expect(summary.prioritized).toBe(all.filter((s) => s.status === "prioritized").length);
  });

  it("returns a detail with a newest-first, state-to-state transition history", () => {
    const detail = demoSignalDetail("sg_onx_101", NOW); // prioritized
    expect(detail).not.toBeNull();
    expect(detail!.signal.id).toBe("sg_onx_101");
    expect(detail!.orgName).toBe("Onixus");
    expect(detail!.transitions.length).toBe(2); // detected→validated, validated→prioritized
    // newest-first
    for (let i = 1; i < detail!.transitions.length; i++) {
      expect(Date.parse(detail!.transitions[i - 1]!.at)).toBeGreaterThanOrEqual(
        Date.parse(detail!.transitions[i]!.at),
      );
    }
    const earliest = detail!.transitions[detail!.transitions.length - 1]!;
    expect(earliest.from).toBe("detected");
    expect(earliest.to).toBe("validated");
    // a just-detected signal has no transitions yet
    const fresh = demoSignalDetail("sg_onx_103", NOW); // detected
    expect(fresh!.transitions).toHaveLength(0);
  });

  it("returns null for an unknown signal id", () => {
    expect(demoSignalDetail("nope", NOW)).toBeNull();
  });

  it("DemoSignalsRepository serves the same data via the port", async () => {
    const repo = new DemoSignalsRepository(() => NOW);
    expect((await repo.list(q())).signals.length).toBeGreaterThan(0);
    expect((await repo.getById("sg_onx_101"))!.orgName).toBe("Onixus");
    expect((await repo.listOrganizations()).length).toBe(DEMO_ORGS.length);
  });
});

describe("demo Analytics", () => {
  it("provides a monotonically-narrowing funnel and consistent event totals", () => {
    const a = demoAnalytics();
    expect(a.assessments).toBeGreaterThan(a.proposalsAccepted);
    expect(a.proposalsAccepted).toBeGreaterThan(a.contractsSigned);
    expect(a.contractsSigned).toBeGreaterThan(a.activations);
    expect(Object.values(a.byName).every((n) => n > 0)).toBe(true);
  });
});

describe("DemoCoreSurfaceRepository", () => {
  const repo: CoreSurfaceRepository = new DemoCoreSurfaceRepository();

  it("serves reads from the dataset", async () => {
    expect(await repo.listAllDomains()).toHaveLength(DEMO_ORGS.length * DOMAIN_KEYS.length);
    expect(await repo.listDomains("demo_onixus")).toHaveLength(DOMAIN_KEYS.length);
    expect((await repo.latestScan("demo_kingston"))!.id).toBe("sc_demo_kingston");
  });

  it("disables writes with a clear DemoModeError", async () => {
    await expect(
      repo.setDomainStatus("demo_onixus", "ai", "operating"),
    ).rejects.toBeInstanceOf(DemoModeError);
    await expect(repo.setScanStatus("sc_demo_onixus", "operating")).rejects.toBeInstanceOf(DemoModeError);
  });
});
