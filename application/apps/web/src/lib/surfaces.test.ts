import { describe, it, expect } from "vitest";
import {
  surfaceFromHost,
  surfaceFromPath,
  roleFromClaims,
  clientIdFromClaims,
  roleAllowedOn,
} from "./surfaces";

describe("surfaceFromHost()", () => {
  it("routes the known subdomains", () => {
    expect(surfaceFromHost("app.brightloop.co")).toBe("portal");
    expect(surfaceFromHost("admin.brightloop.co")).toBe("admin");
    expect(surfaceFromHost("brightloop.co")).toBe("public");
  });

  it("ignores port and case", () => {
    expect(surfaceFromHost("ADMIN.brightloop.co:3000")).toBe("admin");
  });

  it("treats unknown hosts and localhost as public (never as admin)", () => {
    expect(surfaceFromHost("localhost:3000")).toBe("public");
    expect(surfaceFromHost("evil.example.com")).toBe("public");
    expect(surfaceFromHost(null)).toBe("public");
    // A lookalike host must not be mistaken for the admin surface.
    expect(surfaceFromHost("admin.brightloop.co.evil.com")).toBe("public");
  });
});

describe("surfaceFromPath()", () => {
  it("recognises the internal prefixes", () => {
    expect(surfaceFromPath("/portal")).toBe("portal");
    expect(surfaceFromPath("/portal/invoices")).toBe("portal");
    expect(surfaceFromPath("/admin")).toBe("admin");
    expect(surfaceFromPath("/admin/leads")).toBe("admin");
    expect(surfaceFromPath("/workspace")).toBe("workspace");
    expect(surfaceFromPath("/workspace/reports")).toBe("workspace");
    expect(surfaceFromPath("/")).toBe("public");
    expect(surfaceFromPath("/portfolio")).toBe("public");
  });

  it("does not match prefixes that merely start with the segment", () => {
    expect(surfaceFromPath("/portals")).toBe("public");
    expect(surfaceFromPath("/administrator")).toBe("public");
    expect(surfaceFromPath("/workspaces")).toBe("public");
  });
});

describe("claim parsing", () => {
  it("reads a valid role claim", () => {
    expect(roleFromClaims({ role: "owner" })).toBe("owner");
    expect(roleFromClaims({ role: "client_member" })).toBe("client_member");
  });

  it("rejects missing, malformed, or unknown roles", () => {
    expect(roleFromClaims({})).toBeNull();
    expect(roleFromClaims(null)).toBeNull();
    expect(roleFromClaims(undefined)).toBeNull();
    expect(roleFromClaims({ role: "superuser" })).toBeNull();
    expect(roleFromClaims({ role: 42 })).toBeNull();
  });

  it("reads client_id, treating empty/missing as null", () => {
    expect(clientIdFromClaims({ client_id: "cli_A" })).toBe("cli_A");
    expect(clientIdFromClaims({ client_id: "" })).toBeNull();
    expect(clientIdFromClaims({ client_id: null })).toBeNull();
    expect(clientIdFromClaims({})).toBeNull();
  });
});

describe("roleAllowedOn()", () => {
  it("keeps client roles out of admin", () => {
    expect(roleAllowedOn("admin", "client_admin")).toBe(false);
    expect(roleAllowedOn("admin", "client_member")).toBe(false);
  });

  it("keeps internal roles out of the portal", () => {
    expect(roleAllowedOn("portal", "owner")).toBe(false);
    expect(roleAllowedOn("portal", "team_member")).toBe(false);
  });

  it("admits the correct roles to each surface", () => {
    expect(roleAllowedOn("admin", "owner")).toBe(true);
    expect(roleAllowedOn("admin", "team_member")).toBe(true);
    expect(roleAllowedOn("portal", "client_admin")).toBe(true);
    expect(roleAllowedOn("portal", "client_member")).toBe(true);
  });

  it("admits client roles to the workspace product surface, keeps internal out", () => {
    expect(roleAllowedOn("workspace", "client_admin")).toBe(true);
    expect(roleAllowedOn("workspace", "client_member")).toBe(true);
    expect(roleAllowedOn("workspace", "owner")).toBe(false);
    expect(roleAllowedOn("workspace", "team_member")).toBe(false);
  });
});
