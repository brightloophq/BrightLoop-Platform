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
    // E2 Knowledge Base — admins administer collections + all knowledge ops.
    "knowledge.*",
    // E3 AI Strategist — full access.
    "strategy.*",
    // E4 AI Project Manager — full access.
    "planning.*",
    // E6 AI Reporting & BI — full access.
    "report.*",
    // E7 AI Agents & Orchestration — full access.
    "agent.*",
    // E8 Platform Certification — only owners/admins may run certification.
    "certification.*",
    // F2 AI Copilot — full access.
    "copilot.*",
    // F3 Execution Runtime — full runtime + deployment + execution authority.
    "runtime.*",
    "deployment.*",
    "execution.*",
    // F4.1 Integration Platform — full connector authority (install, configure,
    // enable/disable, revoke, health, credentials, oauth, ingest).
    "integration.*",
    // F5 Billing & Subscription — full commercial authority (subscriptions,
    // invoices, usage metering, payment-method administration). Payment-method
    // management (`billing.payment.manage`) is admin-only via this wildcard,
    // matching finance sensitivity (team_member is deliberately excluded below).
    "billing.*",
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
    // E2 Knowledge Base — operators read/write/embed/retrieve, but do NOT
    // administer collections/permissions (no `knowledge.admin`).
    "knowledge.read",
    "knowledge.write",
    "knowledge.delete",
    "knowledge.embed",
    "knowledge.retrieve",
    // E3 AI Strategist — operators author + run + review strategies.
    "strategy.read",
    "strategy.write",
    "strategy.run",
    "strategy.review",
    "strategy.feedback",
    // E4 AI Project Manager — operators plan, review, and approve execution.
    "planning.read",
    "planning.write",
    "planning.run",
    "planning.review",
    "planning.approve",
    "planning.feedback",
    // E5 AI Automation Builder — operators generate/validate/publish automation
    // definitions and prepare deployment packages (never execute or deploy them).
    "automation.read",
    "automation.write",
    "automation.generate",
    "automation.publish",
    "automation.deploy",
    "automation.feedback",
    // E6 AI Reporting & BI — operators collect/generate/publish/schedule reports.
    "report.read",
    "report.write",
    "report.generate",
    "report.publish",
    "report.schedule",
    "report.feedback",
    // E7 AI Agents — operators read/write/run/delegate/review, but do NOT
    // configure profiles (no `agent.configure`) or hold `agent.admin`.
    "agent.read",
    "agent.write",
    "agent.run",
    "agent.delegate",
    "agent.approve",
    "agent.cancel",
    "agent.review",
    "agent.feedback",
    // F2 AI Copilot — operators use the assistant.
    "copilot.read",
    "copilot.use",
    // F3 Execution Runtime — operators register/monitor runtimes, deploy, retry,
    // reconcile. Production deploy/rollback are further gated by runtime POLICY
    // (allowedDeployerRoles + mandatory approval), not permission alone. Rollback,
    // cancel, credential + runtime administration remain owner/admin authorities.
    "runtime.read",
    "runtime.health.check",
    "deployment.read",
    "deployment.create",
    "deployment.deploy",
    "deployment.activate",
    "deployment.pause",
    "deployment.retry",
    "deployment.reconcile",
    "execution.read",
    "execution.retry",
    "execution.stop",
    "execution.logs.read",
    // F4.1 Integration Platform — operators browse the marketplace, install and
    // configure connectors, enable/disable, run health checks, drive OAuth, and
    // ingest events. Revocation + credential administration remain owner/admin.
    "integration.read",
    "integration.install",
    "integration.configure",
    "integration.enable",
    "integration.disable",
    "integration.health.check",
    "integration.oauth.authorize",
    "integration.ingest",
    "integration.invoke",
    // F5 Billing & Subscription — operators read billing, manage subscriptions,
    // issue invoices, and record usage. Payment-method administration
    // (`billing.payment.manage`) is withheld — owner/admin only (finance-grade).
    "billing.read",
    "billing.subscription.write",
    "billing.invoice.write",
    "billing.usage.write",
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
    // E3 AI Strategist — clients may VIEW and give FEEDBACK on their own strategy,
    // but never run or edit it (RLS + ownership scope to the org).
    "strategy.read",
    "strategy.feedback",
    // E4 AI Project Manager — clients may VIEW and give FEEDBACK on their own plan.
    "planning.read",
    "planning.feedback",
    // E5 AI Automation Builder — clients may VIEW and give FEEDBACK on automation.
    "automation.read",
    "automation.feedback",
    // E6 AI Reporting — clients may VIEW reports and give FEEDBACK.
    "report.read",
    "report.feedback",
    // E7 AI Agents — clients may VIEW their org's missions, give FEEDBACK, and
    // respond to approvals ASSIGNED to them (assignment enforced in the use-case +
    // RLS). Clients may NOT configure agents or run missions.
    "agent.read",
    "agent.feedback",
    "agent.approve",
    // F2 AI Copilot — clients may use the assistant (permission-scoped).
    "copilot.read",
    "copilot.use",
    // F3 Execution Runtime — clients VIEW their org's runtime/deployment/execution
    // state and may APPROVE deployments assigned to them (via the existing approval
    // system). Clients never deploy, roll back, or touch credential references.
    "runtime.read",
    "deployment.read",
    "deployment.approve",
    "execution.read",
    "execution.logs.read",
    // F4.1 Integration Platform — clients VIEW their org's connectors + event
    // stream. They never install, configure, or touch credentials/tokens.
    "integration.read",
    // F5 Billing & Subscription — clients VIEW their own plan, usage, and
    // invoices. Subscription changes + payment methods are internal-managed
    // (mutations run through Auxion operators), so no write capability here.
    "billing.read",
  ],
  client_member: [
    "own.project.read",
    "own.deliverables.comment",
    "own.reports.read",
    "own.transformation.read",
    "strategy.read",
    "strategy.feedback",
    "planning.read",
    "planning.feedback",
    "automation.read",
    "automation.feedback",
    "report.read",
    "report.feedback",
    "agent.read",
    "agent.feedback",
    "agent.approve",
    "copilot.read",
    "copilot.use",
    // F3 Execution Runtime — read-only visibility into their org's runtime state.
    "runtime.read",
    "deployment.read",
    "execution.read",
    // F4.1 Integration Platform — read-only visibility into their org's connectors.
    "integration.read",
    // F5 Billing & Subscription — read-only visibility into their org's billing.
    "billing.read",
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
