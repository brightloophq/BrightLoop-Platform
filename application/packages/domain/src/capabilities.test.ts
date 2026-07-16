import { describe, it, expect } from "vitest";
import {
  assertCapability,
  assertOwnClient,
  assertCanActOnClient,
  may,
  type Actor,
} from "./capabilities.js";
import { AuthorizationError, ClientScopeError } from "./errors.js";

const owner: Actor = { userId: "usr_o", role: "owner", clientId: null };
const teamMember: Actor = { userId: "usr_t", role: "team_member", clientId: null };
const clientAdminA: Actor = { userId: "usr_a", role: "client_admin", clientId: "cli_A" };
const clientMemberA: Actor = { userId: "usr_m", role: "client_member", clientId: "cli_A" };

describe("assertCapability()", () => {
  it("allows a permitted capability", () => {
    expect(() => assertCapability(owner, "finance.refund")).not.toThrow();
    expect(() => assertCapability(clientAdminA, "own.invoices.pay")).not.toThrow();
  });

  it("throws AuthorizationError with 403 when the role lacks it", () => {
    try {
      assertCapability(clientMemberA, "own.invoices.pay");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthorizationError);
      expect((err as AuthorizationError).httpStatus).toBe(403);
    }
  });

  it("keeps team_member out of finance", () => {
    expect(() => assertCapability(teamMember, "finance.refund")).toThrow(AuthorizationError);
  });
});

describe("assertOwnClient() — cross-client isolation", () => {
  it("allows a client actor to act on their own org", () => {
    expect(() => assertOwnClient(clientAdminA, "cli_A")).not.toThrow();
  });

  it("blocks a client actor from another org's records", () => {
    try {
      assertOwnClient(clientAdminA, "cli_B");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ClientScopeError);
      expect((err as ClientScopeError).httpStatus).toBe(403);
      // The error must not leak the target org id in its message.
      expect((err as ClientScopeError).message).toBe("Cross-client access denied");
    }
  });

  it("blocks a client actor with no clientId claim", () => {
    const orphan: Actor = { userId: "usr_x", role: "client_member", clientId: null };
    expect(() => assertOwnClient(orphan, "cli_A")).toThrow(ClientScopeError);
  });

  it("does not ownership-scope internal roles (they are capability-scoped)", () => {
    expect(() => assertOwnClient(owner, "cli_A")).not.toThrow();
    expect(() => assertOwnClient(teamMember, "cli_B")).not.toThrow();
  });
});

describe("assertCanActOnClient()", () => {
  it("requires both the capability and ownership", () => {
    expect(() => assertCanActOnClient(clientAdminA, "own.contract.sign", "cli_A")).not.toThrow();
    // right capability, wrong org
    expect(() => assertCanActOnClient(clientAdminA, "own.contract.sign", "cli_B")).toThrow(
      ClientScopeError,
    );
    // right org, missing capability
    expect(() => assertCanActOnClient(clientMemberA, "own.contract.sign", "cli_A")).toThrow(
      AuthorizationError,
    );
  });
});

describe("may() — non-throwing UI gate", () => {
  it("mirrors the capability matrix without throwing", () => {
    expect(may(clientAdminA, "own.deliverables.approve")).toBe(true);
    expect(may(clientMemberA, "own.deliverables.approve")).toBe(false);
  });
});
