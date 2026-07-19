import { describe, it, expect } from "vitest";
import type { Actor } from "@brightloop/domain";
import { transformationNavGroup, TRANSFORMATION_NAV } from "./transformation-nav";

const owner: Actor = { userId: "u1", role: "owner", clientId: null };
const admin: Actor = { userId: "u2", role: "admin", clientId: null };
const teamMember: Actor = { userId: "u3", role: "team_member", clientId: null };
const clientAdmin: Actor = { userId: "u4", role: "client_admin", clientId: "cli_A" };

describe("transformationNavGroup", () => {
  it("gives owner the full transformation nav including Settings", () => {
    const group = transformationNavGroup(owner);
    expect(group?.label).toBe("Transformation");
    const labels = group?.items.map((i) => i.label) ?? [];
    expect(labels).toEqual([
      "Console",
      "Business Scan",
      "Activation",
      "Signals",
      "Insights",
      "Recommendations",
      "Approvals",
      "Moves",
      "Measurements",
      "Knowledge",
      "Settings",
    ]);
    expect(group?.items.every((i) => i.ready)).toBe(true);
  });

  it("uses canonical 'Console' terminology while keeping the stable /admin/dashboard route", () => {
    const group = transformationNavGroup(owner);
    const console = group?.items.find((i) => i.href === "/admin/dashboard");
    expect(console?.label).toBe("Console"); // visible term is canonical
    expect(console?.href).toBe("/admin/dashboard"); // internal route unchanged
    // no legacy 'Dashboard' label leaks into the visible nav
    expect((group?.items ?? []).some((i) => i.label === "Dashboard")).toBe(false);
  });

  it("shows Business Scan + Activation to internal roles, hides them from clients", () => {
    const labels = (transformationNavGroup(teamMember)?.items ?? []).map((i) => i.label);
    expect(labels).toContain("Business Scan");
    expect(labels).toContain("Activation");
    expect(transformationNavGroup(clientAdmin)).toBeNull(); // whole group hidden from clients
  });

  it("shows admin the full nav (settings.* granted)", () => {
    const labels = transformationNavGroup(admin)?.items.map((i) => i.label) ?? [];
    expect(labels).toContain("Settings");
    expect(labels).toHaveLength(TRANSFORMATION_NAV.length + 1);
  });

  it("hides Settings from team_member (no settings capability)", () => {
    const labels = transformationNavGroup(teamMember)?.items.map((i) => i.label) ?? [];
    expect(labels).not.toContain("Settings");
    expect(labels).toHaveLength(TRANSFORMATION_NAV.length);
    expect(labels).toContain("Signals");
  });

  it("hides the whole command center from a client role", () => {
    expect(transformationNavGroup(clientAdmin)).toBeNull();
  });

  it("every nav item points at a real /admin route (no dead links)", () => {
    const labels = transformationNavGroup(owner)?.items ?? [];
    expect(labels.every((i) => i.href.startsWith("/admin/"))).toBe(true);
  });
});
