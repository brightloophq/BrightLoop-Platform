import { describe, it, expect } from "vitest";
import {
  hasCapability,
  isInternalRole,
  isClientRole,
  isRole,
  ROLE_NAMES,
} from "./roles.js";

describe("capability matrix — hasCapability()", () => {
  it("owner holds every capability via '*'", () => {
    expect(hasCapability("owner", "finance.refund")).toBe(true);
    expect(hasCapability("owner", "anything.at.all")).toBe(true);
  });

  it("namespace wildcards grant nested capabilities", () => {
    expect(hasCapability("admin", "clients.read")).toBe(true);
    expect(hasCapability("admin", "finance.refund")).toBe(true);
    expect(hasCapability("admin", "projects.delete")).toBe(true);
  });

  it("exact non-wildcard grants match only themselves", () => {
    expect(hasCapability("admin", "team.read")).toBe(true);
    expect(hasCapability("admin", "team.write")).toBe(false); // only team.read granted
  });

  it("team_member cannot touch finance/marketing/automation/settings", () => {
    expect(hasCapability("team_member", "finance.refund")).toBe(false);
    expect(hasCapability("team_member", "marketing.publish")).toBe(false);
    expect(hasCapability("team_member", "settings.update")).toBe(false);
    expect(hasCapability("team_member", "deliverables.review")).toBe(true);
  });

  it("client_member cannot approve, pay, sign, or invite", () => {
    expect(hasCapability("client_member", "own.deliverables.approve")).toBe(false);
    expect(hasCapability("client_member", "own.invoices.pay")).toBe(false);
    expect(hasCapability("client_member", "own.contract.sign")).toBe(false);
    expect(hasCapability("client_member", "own.team.invite")).toBe(false);
    expect(hasCapability("client_member", "own.deliverables.comment")).toBe(true);
  });

  it("client_admin can approve, pay, and sign", () => {
    expect(hasCapability("client_admin", "own.deliverables.approve")).toBe(true);
    expect(hasCapability("client_admin", "own.invoices.pay")).toBe(true);
    expect(hasCapability("client_admin", "own.contract.sign")).toBe(true);
  });
});

describe("role scope helpers", () => {
  it("classifies internal vs client roles", () => {
    expect(isInternalRole("owner")).toBe(true);
    expect(isInternalRole("client_admin")).toBe(false);
    expect(isClientRole("client_member")).toBe(true);
    expect(isClientRole("admin")).toBe(false);
  });

  it("isRole narrows unknown strings", () => {
    expect(isRole("owner")).toBe(true);
    expect(isRole("wizard")).toBe(false);
  });

  it("exposes exactly the five roles", () => {
    expect(ROLE_NAMES).toHaveLength(5);
  });
});
