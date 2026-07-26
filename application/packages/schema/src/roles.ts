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
    // Strategist authority over the transformation cycle, including granting
    // approvals (`transformation.approve` is included by this namespace wildcard).
    // The wildcard also grants the Phase D `transformation.write` (workspace seed).
    "transformation.*",
    // Phase D · Transformation Execution — initiatives + execution-management
    // aggregates live in their own namespaces (not under `transformation.*`).
    "initiative.*",
    "review.*",
    "task.*",
    "assignment.*",
    "dependency.*",
    "timeline.*",
    "milestone.*",
    "kpi.*",
    "progress.*",
    // D7 collaboration & operational awareness.
    "notification.*",
    "subscription.*",
    "mention.*",
    // E1 AI Foundation — admins manage providers + all AI operations.
    "prompt.*",
    "usage.*",
    "cost.*",
    "conversation.*",
    "evaluation.*",
    "ai.*",
  ],
  team_member: [
    "projects.read",
    "projects.update",
    "deliverables.*",
    "messages.*",
    "meetings.*",
    "clients.read",
    // Operations Manager: drives transformation work, but does NOT hold
    // `transformation.approve` — granting an approval is a Strategist (owner/admin)
    // authority (mirrors sales, where team_member lacks `clients.update`).
    "transformation.read",
    "transformation.signals.write",
    "transformation.insights.write",
    "transformation.recommendations.write",
    "transformation.approvals.request",
    "transformation.moves.write",
    "transformation.executions.write",
    "transformation.measurements.write",
    "transformation.learnings.write",
    "transformation.risks.write",
    "transformation.knowledge.write",
    "transformation.health.write",
    "transformation.index.write",
    // Phase 1 core surfaces (Business Scan / Activation). Read is covered by
    // `transformation.read`; owner/admin hold these via the `transformation.*` wildcard.
    "transformation.scan.write",
    "transformation.activation.write",
    // Phase D · Transformation Execution: seed + read a workspace and read its
    // initiatives (D1); transition an initiative's lifecycle (D2). Approval / task
    // / timeline authority arrives in D3+.
    "transformation.write",
    "initiative.read",
    "initiative.write",
    // D3/D4 execution management (internal operators).
    "review.read",
    "review.write",
    "task.read",
    "task.write",
    "assignment.write",
    "dependency.write",
    // D5/D6 planning & performance.
    "timeline.read",
    "timeline.write",
    "milestone.read",
    "milestone.write",
    "kpi.read",
    "kpi.write",
    "progress.read",
    // D7 collaboration & operational awareness (internal operators).
    "notification.read",
    "notification.write",
    "subscription.read",
    "subscription.write",
    "mention.read",
    "mention.write",
    // E1 AI Foundation — operators author/run prompts + read usage/cost, but do
    // NOT manage provider configuration (no `ai.provider.write`).
    "prompt.read",
    "prompt.write",
    "prompt.publish",
    "prompt.execute",
    "usage.read",
    "cost.read",
    "conversation.read",
    "conversation.write",
    "evaluation.read",
  ],
  client_admin: [
    "own.project.read",
    "own.deliverables.approve",
    "own.invoices.pay",
    "own.contract.sign",
    "own.team.invite",
    "own.reports.read",
    "own.settings",
    // Read-only access to their OWN transformation progress (Business Health /
    // Transformation Index). Additionally row-scoped to the org by RLS.
    "own.transformation.read",
  ],
  client_member: [
    "own.project.read",
    "own.deliverables.comment",
    "own.reports.read",
    "own.transformation.read",
  ],
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
