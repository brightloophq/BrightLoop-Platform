import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
      "Prospect Scanner",
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

  /**
   * This test used to assert only that each href STARTED WITH "/admin/", which
   * is not what its name claims and would pass for a route that does not exist.
   * It now resolves each one on disk. The Prospect Scanner was built, complete
   * with its own API routes and tests, and reachable from nowhere; a nav test
   * that only pattern-matched strings could never notice.
   */
  it("every nav item points at a real /admin route (no dead links)", () => {
    const appDir = fileURLToPath(new URL("../app", import.meta.url));
    for (const item of transformationNavGroup(owner)?.items ?? []) {
      expect(item.href.startsWith("/admin/")).toBe(true);
      const dir = `${appDir}${item.href}`;
      expect(
        existsSync(`${dir}/page.tsx`) || existsSync(`${dir}/page.ts`),
        `${item.label} → ${item.href} has no page file`,
      ).toBe(true);
    }
  });

  /* ---- the Prospect Scanner, which had no way in at all ------------------- */

  it("exposes the Prospect Scanner, which was previously unreachable", () => {
    const item = transformationNavGroup(owner)?.items.find(
      (i) => i.href === "/admin/prospect-scanner",
    );
    expect(item?.label).toBe("Prospect Scanner");
  });

  it("gives the Prospect Scanner to every internal role that can run a scan", () => {
    for (const actor of [owner, admin, teamMember]) {
      const hrefs = (transformationNavGroup(actor)?.items ?? []).map((i) => i.href);
      expect(hrefs).toContain("/admin/prospect-scanner");
    }
  });

  it("keeps Business Scan alongside it — the scanner does not replace it", () => {
    const hrefs = (transformationNavGroup(owner)?.items ?? []).map((i) => i.href);
    expect(hrefs).toContain("/admin/business-scan");
    expect(hrefs).toContain("/admin/prospect-scanner");
  });

  it("never shows the scanner to a client role", () => {
    expect(transformationNavGroup(clientAdmin)).toBeNull();
  });

  /**
   * The menu entry and the page must be gated on the SAME capability, or the
   * nav offers a door the page refuses to open. Today every internal role holds
   * `transformation.scan.write`, so no role exercises the difference — which is
   * exactly why this is pinned rather than left to a role fixture that would
   * quietly stop proving anything.
   */
  it("gates the scanner on the capability its page asserts", () => {
    const entry = TRANSFORMATION_NAV.find((i) => i.href === "/admin/prospect-scanner");
    expect(entry && "cap" in entry && entry.cap).toBe("transformation.scan.write");

    const page = readFileSync(
      fileURLToPath(new URL("../app/admin/prospect-scanner/page.tsx", import.meta.url)),
      "utf8",
    );
    expect(page).toContain('SCANNER_CAP = "transformation.scan.write"');
  });
});
