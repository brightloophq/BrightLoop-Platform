import { describe, it, expect } from "vitest";
import { PlaceholderCatalogRepository } from "./catalog.repository.js";
import { PLACEHOLDER_MODULES } from "./catalog.dataset.js";

const repo = new PlaceholderCatalogRepository();

describe("PlaceholderCatalogRepository — modules", () => {
  it("orders modules Brand → Build → Automate → Grow", async () => {
    const stages = (await repo.listModules()).map((m) => m.stage);
    const firstGrow = stages.indexOf("Grow");
    const lastBrand = stages.lastIndexOf("Brand");
    expect(lastBrand).toBeLessThan(firstGrow);
  });

  it("lists modules for one discipline", async () => {
    const build = await repo.listModulesByDiscipline("Build");
    expect(build.map((m) => m.id).sort()).toEqual(["landing-page", "website"]);
  });

  it("joins a module with its editorial content and a resolved range", async () => {
    const detail = await repo.getModuleDetail("brand-identity");
    expect(detail?.module.name).toBe("Brand Identity");
    expect(detail?.content?.outcome).toBe("A Brand That Earns Instant Trust");
    expect(detail?.range).toEqual([1800, 3600]);
  });

  it("returns null for an unknown module", async () => {
    expect(await repo.getModuleDetail("nope")).toBeNull();
  });

  it("always resolves a range, even without editorial content", async () => {
    const scoped = new PlaceholderCatalogRepository({
      modules: [
        {
          id: "uncatalogued",
          stage: "Grow",
          name: "Uncatalogued",
          from: 1000,
          weeks: [1, 2],
          assets: [],
          includes: [],
          why: "",
          deps: [],
          growth: "",
        },
      ],
    });
    const detail = await scoped.getModuleDetail("uncatalogued");
    expect(detail?.content).toBeNull();
    expect(detail?.range).toEqual([1000, 1900]); // derived, still a range
  });
});

describe("PlaceholderCatalogRepository — plans", () => {
  it("lists the four productised plans", async () => {
    expect((await repo.listPlans()).map((p) => p.id)).toEqual([
      "foundation",
      "launch",
      "transform",
      "partner",
    ]);
  });

  it("resolves a plan's modules and sums an estimate RANGE", async () => {
    const detail = await repo.getPlanDetail("foundation");
    expect(detail?.plan.name).toBe("Foundation");
    expect(detail?.modules.length).toBe(5);

    const [lo, hi] = detail!.range;
    expect(hi).toBeGreaterThan(lo);
    // The plan range is the sum of its modules' ranges — never a single figure.
    const sumLo = detail!.modules.reduce((s, m) => s + m.range[0], 0);
    expect(lo).toBe(sumLo);
  });

  it("excludes `upgrade` modules from plan roll-ups so brand work is not double-counted", async () => {
    // brand-refresh is an alternative to brand-identity, not an addition.
    const upgradeModule = PLACEHOLDER_MODULES.find((m) => m.id === "brand-refresh");
    expect(upgradeModule?.upgrade).toBe(true);

    const scoped = new PlaceholderCatalogRepository({
      plans: [
        { id: "t", name: "T", tag: "", blurb: "", modules: ["brand-identity", "brand-refresh"] },
      ],
    });
    const detail = await scoped.getPlanDetail("t");
    expect(detail?.modules.map((m) => m.module.id)).toEqual(["brand-identity"]);
  });

  it("computes a delivery window from the modules' upper week bounds", async () => {
    const detail = await repo.getPlanDetail("foundation");
    expect(detail?.weeksMax).toBeGreaterThan(0);
  });

  it("returns null for an unknown plan", async () => {
    expect(await repo.getPlanDetail("nope")).toBeNull();
  });
});

describe("PlaceholderCatalogRepository — reference data", () => {
  it("exposes owned-asset keys that modules actually reference", async () => {
    const assets = await repo.listAssets();
    const keys = new Set(assets.map((a) => a.key));
    expect(keys.has("logo")).toBe(true);
    expect(keys.has("website")).toBe(true);
  });

  it("explains why an estimate is a range", async () => {
    const factors = await repo.listRangeFactors();
    expect(factors.length).toBeGreaterThan(0);
    expect(factors.map(([label]) => label)).toContain("Existing assets");
  });

  it("reports itself as placeholder data", () => {
    expect(repo.source).toBe("placeholder");
  });
});
