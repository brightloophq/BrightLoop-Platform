import { describe, it, expect } from "vitest";
import { pageSkeletonPlan, type PageSkeletonVariant } from "./PageSkeleton.plan";

const VARIANTS: PageSkeletonVariant[] = ["table", "grid", "analytics", "detail", "list"];

describe("pageSkeletonPlan", () => {
  it("builds a plan for every variant with the header on by default", () => {
    for (const v of VARIANTS) {
      const plan = pageSkeletonPlan(v);
      expect(plan.variant).toBe(v);
      expect(plan.header).toBe(true);
      expect(plan.groups.length).toBeGreaterThan(0);
    }
  });

  it("omits the header when asked", () => {
    expect(pageSkeletonPlan("list", { header: false }).header).toBe(false);
  });

  it("table = a toolbar then N rows; count controls the rows", () => {
    const plan = pageSkeletonPlan("table", { count: 4 });
    const roles = plan.groups.map((g) => g.role);
    expect(roles).toEqual(["toolbar", "rows"]);
    expect(plan.groups[0]!.blocks).toHaveLength(2); // search + action
    expect(plan.groups[1]!.blocks).toHaveLength(4);
  });

  it("grid = N cards", () => {
    expect(pageSkeletonPlan("grid", { count: 9 }).groups[0]!.blocks).toHaveLength(9);
    expect(pageSkeletonPlan("grid").groups[0]!.role).toBe("grid");
  });

  it("analytics = a fixed 4-up KPI row then N panels", () => {
    const plan = pageSkeletonPlan("analytics", { count: 3 });
    expect(plan.groups.map((g) => g.role)).toEqual(["kpi", "panels"]);
    expect(plan.groups[0]!.blocks).toHaveLength(4); // KPI row is always 4
    expect(plan.groups[1]!.blocks).toHaveLength(3);
  });

  it("detail = a two-column main/aside plan (count-independent)", () => {
    const plan = pageSkeletonPlan("detail");
    expect(plan.groups.map((g) => g.role)).toEqual(["detailMain", "detailAside"]);
    for (const g of plan.groups) expect(g.blocks.length).toBeGreaterThan(0);
  });

  it("list = N full-width rows", () => {
    const plan = pageSkeletonPlan("list", { count: 7 });
    expect(plan.groups[0]!.role).toBe("rows");
    expect(plan.groups[0]!.blocks).toHaveLength(7);
  });

  it("clamps repeated-unit counts to at least 1", () => {
    expect(pageSkeletonPlan("list", { count: 0 }).groups[0]!.blocks).toHaveLength(1);
    expect(pageSkeletonPlan("grid", { count: -5 }).groups[0]!.blocks).toHaveLength(1);
  });

  it("every block carries an explicit height and a token radius (no content-jump, no raw px radius)", () => {
    for (const v of VARIANTS) {
      for (const group of pageSkeletonPlan(v).groups) {
        for (const b of group.blocks) {
          expect(b.height).toBeTruthy();
          expect(b.radius).toMatch(/^var\(--radius-/);
        }
      }
    }
  });
});
