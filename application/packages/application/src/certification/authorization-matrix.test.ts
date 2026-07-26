/* =============================================================================
 * Phase D authorization capability matrix (D8 certification).
 *
 * Exhaustively asserts the Phase D capability grants per role from the single
 * source of truth (`hasCapability`). Proves: client roles receive NO Phase D
 * internal capability; team_member gets exactly the operational set; owner/admin
 * hold every Phase D capability; no wildcard leaks to a client role.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { hasCapability, type Role } from "@brightloop/schema";

/** Every Phase D capability introduced across D1–D7. */
const PHASE_D_CAPS = [
  "transformation.write", "transformation.read",
  "initiative.read", "initiative.write",
  "review.read", "review.write",
  "task.read", "task.write",
  "assignment.write", "dependency.write",
  "timeline.read", "timeline.write",
  "milestone.read", "milestone.write",
  "kpi.read", "kpi.write",
  "progress.read",
  "notification.read", "notification.write",
  "subscription.read", "subscription.write",
  "mention.read", "mention.write",
] as const;

const CLIENT_ROLES: Role[] = ["client_admin", "client_member"];
const INTERNAL_ROLES: Role[] = ["owner", "admin", "team_member"];

/** team_member's intended operational grants (write authority minus approvals). */
const TEAM_MEMBER_GRANTED = new Set<string>([
  "transformation.write", "transformation.read",
  "initiative.read", "initiative.write",
  "review.read", "review.write",
  "task.read", "task.write",
  "assignment.write", "dependency.write",
  "timeline.read", "timeline.write",
  "milestone.read", "milestone.write",
  "kpi.read", "kpi.write",
  "progress.read",
  "notification.read", "notification.write",
  "subscription.read", "subscription.write",
  "mention.read", "mention.write",
]);

describe("Phase D authorization matrix", () => {
  it("client roles hold ZERO Phase D internal capabilities", () => {
    for (const role of CLIENT_ROLES) {
      for (const cap of PHASE_D_CAPS) {
        expect(hasCapability(role, cap), `${role} must NOT have ${cap}`).toBe(false);
      }
    }
  });

  it("owner and admin hold EVERY Phase D capability", () => {
    for (const role of ["owner", "admin"] as Role[]) {
      for (const cap of PHASE_D_CAPS) {
        expect(hasCapability(role, cap), `${role} must have ${cap}`).toBe(true);
      }
    }
  });

  it("team_member holds exactly the intended operational set", () => {
    for (const cap of PHASE_D_CAPS) {
      expect(hasCapability("team_member", cap), `team_member ${cap}`).toBe(TEAM_MEMBER_GRANTED.has(cap));
    }
  });

  it("team_member does NOT hold approval-granting authority", () => {
    // Approvals (transformation.approve) are a Strategist (owner/admin) power.
    expect(hasCapability("team_member", "transformation.approve")).toBe(false);
    expect(hasCapability("owner", "transformation.approve")).toBe(true);
    expect(hasCapability("admin", "transformation.approve")).toBe(true);
  });

  it("no internal wildcard leaks a Phase D capability to a client role", () => {
    for (const role of CLIENT_ROLES) {
      // client caps are all `own.*`; assert none of the internal namespaces resolve.
      for (const ns of ["notification", "subscription", "mention", "timeline", "kpi", "progress", "review", "task"]) {
        expect(hasCapability(role, `${ns}.read`)).toBe(false);
        expect(hasCapability(role, `${ns}.write`)).toBe(false);
      }
    }
  });

  it("internal roles are internal-scoped and client roles are client-scoped (sanity)", () => {
    for (const role of INTERNAL_ROLES) expect(hasCapability(role, "transformation.read")).toBe(true);
    for (const role of CLIENT_ROLES) expect(hasCapability(role, "own.transformation.read")).toBe(true);
  });
});
