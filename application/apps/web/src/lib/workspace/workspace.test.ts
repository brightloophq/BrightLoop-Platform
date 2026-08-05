import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WORKSPACE_NAV, activeNavKey, breadcrumbs } from "./nav";
import { WORKSPACE_COMMANDS, filterCommands, subsequenceMatch } from "./command-palette";
import { rankSearch, groupByKind, type SearchDoc } from "./search";
import { deriveNotifications, actionableCount } from "./notifications";

describe("workspace navigation", () => {
  it("exposes the primary product sections", () => {
    expect(WORKSPACE_NAV.map((n) => n.key)).toEqual(["dashboard", "projects", "ai-team", "copilot", "automations", "deployments", "runtimes", "integrations", "executions", "reports", "approvals", "activity", "settings"]);
  });
  it("resolves the active section by longest-prefix match", () => {
    expect(activeNavKey("/workspace")).toBe("dashboard");
    expect(activeNavKey("/workspace/reports")).toBe("reports");
    expect(activeNavKey("/workspace/projects/proj_123")).toBe("projects");
    expect(activeNavKey("/workspace/missions/m_1")).toBe("dashboard"); // no missions nav item → falls back
  });
  it("builds a rooted breadcrumb trail and humanizes segments", () => {
    expect(breadcrumbs("/workspace")).toEqual([{ label: "Workspace", href: "/workspace" }]);
    const t = breadcrumbs("/workspace/ai-team");
    expect(t.map((b) => b.label)).toEqual(["Workspace", "AI Team"]);
    const d = breadcrumbs("/workspace/projects/proj_abc123def");
    expect(d[d.length - 1]!.label).toBe("Detail"); // opaque id collapses
  });
  it("every nav destination resolves to a real route (no dead links)", () => {
    // PX.1g navigation-parity guard: a sidebar href with no page.tsx behind it is a
    // dead link. This test file lives at src/lib/workspace/, so the App Router tree
    // is ../../app and an href "/workspace/x" maps to ../../app/workspace/x/page.tsx.
    for (const item of WORKSPACE_NAV) {
      const page = fileURLToPath(new URL(`../../app${item.href}/page.tsx`, import.meta.url));
      expect(existsSync(page), `${item.key} → ${item.href} has no page.tsx`).toBe(true);
    }
  });
});

describe("command palette", () => {
  it("subsequence-matches", () => {
    expect(subsequenceMatch("generate report", "grpt")).toBe(true);
    expect(subsequenceMatch("generate report", "zzz")).toBe(false);
  });
  it("returns all commands for an empty query", () => {
    expect(filterCommands("")).toHaveLength(WORKSPACE_COMMANDS.length);
  });
  it("ranks a fuzzy query, best match first", () => {
    const r = filterCommands("report");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]!.label.toLowerCase()).toContain("report");
  });
  it("finds create-mission by keyword", () => {
    expect(filterCommands("orchestrate").some((c) => c.id === "start-mission")).toBe(true);
  });
});

describe("global search", () => {
  const docs: SearchDoc[] = [
    { id: "p1", kind: "project", title: "CRM Rollout", subtitle: "Sales", href: "/workspace/projects/p1" },
    { id: "r1", kind: "report", title: "Q3 Executive Summary", subtitle: "reporting", href: "/workspace/reports" },
    { id: "a1", kind: "approval", title: "Publish workflow", subtitle: "pending", href: "/workspace/approvals" },
  ];
  it("returns nothing for an empty query", () => {
    expect(rankSearch("", docs)).toEqual([]);
  });
  it("ranks title hits and prioritizes approvals/missions", () => {
    const r = rankSearch("p", docs);
    expect(r[0]!.kind).toBe("approval"); // approvals weighted first among equal title hits
    const grouped = groupByKind(rankSearch("o", docs));
    expect(grouped[0]!.kind).toBe("approval");
  });
});

describe("notifications", () => {
  it("derives notifications from read-model data, newest first, and counts actionable", () => {
    const notifs = deriveNotifications({
      missions: [{ id: "m1", title: "Brief", status: "completed", updatedAt: "2026-07-27T03:00:00Z" }],
      approvals: [{ id: "a1", taskKey: "review", missionId: "m1", requestedAt: "2026-07-27T04:00:00Z" }],
      reports: [{ id: "r1", title: "Q3", status: "generated", updatedAt: "2026-07-27T02:00:00Z" }],
      failures: [{ id: "f1", missionId: "m1", category: "upstream", cause: "timeout", createdAt: "2026-07-27T05:00:00Z" }],
    });
    expect(notifs[0]!.kind).toBe("failure"); // newest
    expect(notifs.some((n) => n.kind === "approval_required")).toBe(true);
    expect(notifs.some((n) => n.kind === "report_ready")).toBe(true);
    // actionable = approval + failure + completed mission = 3
    expect(actionableCount(notifs)).toBe(3);
  });
});
