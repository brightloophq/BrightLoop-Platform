/* =============================================================================
 * Roles & permissions — ported verbatim from docs/handoff/reference/schema.js.
 * SINGLE SOURCE OF TRUTH for authorization. Enforced in UI (hide/disable) AND
 * at the data layer (RLS). Do not diverge from the handoff schema.
 * ========================================================================== */

export const ROLES = {
  // Internal (Auxion)
  owner: { scope: "internal", label: "Owner" },
  admin: { scope: "internal", label: "Admin" },
  team_member: { scope: "internal", label: "Team Member" },
  // External (Client org)
  client_admin: { scope: "client", label: "Client Admin" },
  client_member: { scope: "client", label: "Client Member" },
} as const;

export type Role = keyof typeof ROLES;
export type RoleScope = (typeof ROLES)[Role]["scope"];

/**
 * Capability matrix. `*` = all. `x.*` = all capabilities under the `x` namespace.
 * Client capabilities are prefixed `own.` and are additionally scoped to the
 * caller's own client org by RLS (`row.clientId = auth.client_id`).
 */
export const PERMISSIONS = {
  owner: ["*"],
  admin: [
    "clients.*",
    "projects.*",
    "finance.*",
    "marketing.*",
    "automation.*",
    "team.read",
    "analytics.*",
    "settings.*",
  ],
  team_member: [
    "projects.read",
    "projects.update",
    "deliverables.*",
    "messages.*",
    "meetings.*",
    "clients.read",
  ],
  client_admin: [
    "own.project.read",
    "own.deliverables.approve",
    "own.invoices.pay",
    "own.contract.sign",
    "own.team.invite",
    "own.reports.read",
    "own.settings",
  ],
  client_member: ["own.project.read", "own.deliverables.comment", "own.reports.read"],
} as const satisfies Record<Role, readonly string[]>;

export const ROLE_NAMES = Object.keys(ROLES) as Role[];

export function isRole(value: string): value is Role {
  return Object.prototype.hasOwnProperty.call(ROLES, value);
}

export function isInternalRole(role: Role): boolean {
  return ROLES[role].scope === "internal";
}

export function isClientRole(role: Role): boolean {
  return ROLES[role].scope === "client";
}

/**
 * Does `role` hold `capability`? Supports exact matches, the global `*`, and
 * namespace wildcards (`clients.*` grants `clients.read`, `clients.create`, …).
 */
export function hasCapability(role: Role, capability: string): boolean {
  const granted = PERMISSIONS[role] as readonly string[];
  for (const g of granted) {
    if (g === "*") return true;
    if (g === capability) return true;
    if (g.endsWith(".*")) {
      const prefix = g.slice(0, -2);
      if (capability === prefix || capability.startsWith(prefix + ".")) return true;
    }
  }
  return false;
}
