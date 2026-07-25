/* =============================================================================
 * Transformation Execution — row ↔ domain mappers (Phase D · Sprint D1).
 *
 * The type-safe boundary between snake_case DB rows and the camelCase domain
 * shapes (`@brightloop/schema`). Row shapes are exercised against the real schema
 * by the live integration/pgTAP suites. jsonb id arrays collapse defensively.
 * ========================================================================== */

import type { Initiative, TransformationActivity, TransformationWorkspace } from "@brightloop/schema";

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

/* ---- workspace ------------------------------------------------------------- */
export function workspaceRow(w: TransformationWorkspace): Record<string, unknown> {
  return {
    id: w.id,
    client_id: w.clientId,
    scan_run_id: w.scanRunId,
    report_artifact_id: w.reportArtifactId,
    proposal_artifact_id: w.proposalArtifactId,
    title: w.title,
    objectives: w.objectives,
    status: w.status,
    seed_checksum: w.seedChecksum,
    version: w.version,
    created_at: w.createdAt,
  };
}

export function toWorkspace(row: Record<string, unknown>): TransformationWorkspace {
  return {
    id: String(row["id"]),
    clientId: (row["client_id"] as string | null) ?? null,
    scanRunId: String(row["scan_run_id"]),
    reportArtifactId: (row["report_artifact_id"] as string | null) ?? null,
    proposalArtifactId: (row["proposal_artifact_id"] as string | null) ?? null,
    title: String(row["title"]),
    objectives: toStringArray(row["objectives"]),
    status: row["status"] as TransformationWorkspace["status"],
    seedChecksum: String(row["seed_checksum"]),
    version: typeof row["version"] === "number" ? (row["version"] as number) : 1,
    createdAt: String(row["created_at"]),
  };
}

/* ---- initiative ------------------------------------------------------------ */
export function initiativeRow(i: Initiative): Record<string, unknown> {
  return {
    id: i.id,
    workspace_id: i.workspaceId,
    client_id: i.clientId,
    source_proposal_item_id: i.sourceProposalItemId,
    title: i.title,
    objective: i.objective,
    priority: i.priority,
    effort: i.effort,
    business_impact: i.businessImpact,
    dependencies: i.dependencies,
    supporting_evidence_ids: i.supportingEvidenceIds,
    proposal_artifact_id: i.proposalArtifactId,
    execution_status: i.executionStatus,
    version: i.version,
    created_at: i.createdAt,
  };
}

export function toInitiative(row: Record<string, unknown>): Initiative {
  return {
    id: String(row["id"]),
    workspaceId: String(row["workspace_id"]),
    clientId: (row["client_id"] as string | null) ?? null,
    sourceProposalItemId: String(row["source_proposal_item_id"]),
    title: String(row["title"]),
    objective: (row["objective"] as string | null) ?? null,
    priority: row["priority"] as Initiative["priority"],
    effort: row["effort"] as Initiative["effort"],
    businessImpact: row["business_impact"] as Initiative["businessImpact"],
    dependencies: toStringArray(row["dependencies"]),
    supportingEvidenceIds: toStringArray(row["supporting_evidence_ids"]),
    proposalArtifactId: String(row["proposal_artifact_id"] ?? ""),
    executionStatus: row["execution_status"] as Initiative["executionStatus"],
    version: typeof row["version"] === "number" ? (row["version"] as number) : 1,
    createdAt: String(row["created_at"]),
  };
}

/* ---- activity -------------------------------------------------------------- */
export function activityRow(a: TransformationActivity): Record<string, unknown> {
  return {
    id: a.id,
    workspace_id: a.workspaceId,
    client_id: a.clientId,
    type: a.type,
    subject_type: a.subjectType,
    subject_id: a.subjectId,
    summary: a.summary,
    command_id: a.commandId,
    at: a.at,
  };
}

export function toActivity(row: Record<string, unknown>): TransformationActivity {
  return {
    id: String(row["id"]),
    workspaceId: String(row["workspace_id"]),
    clientId: (row["client_id"] as string | null) ?? null,
    type: row["type"] as TransformationActivity["type"],
    subjectType: row["subject_type"] as TransformationActivity["subjectType"],
    subjectId: String(row["subject_id"]),
    summary: String(row["summary"]),
    commandId: String(row["command_id"]),
    at: String(row["at"]),
  };
}

/* ---- D3/D4 execution-management mappers ------------------------------------ */
import type { Assignment, Dependency, Review, Task } from "@brightloop/schema";

export function reviewRow(r: Review): Record<string, unknown> {
  return { id: r.id, workspace_id: r.workspaceId, initiative_id: r.initiativeId, client_id: r.clientId, status: r.status, note: r.note, decision_actor_id: r.decisionActorId, version: r.version, created_at: r.createdAt };
}
export function toReview(row: Record<string, unknown>): Review {
  return {
    id: String(row["id"]), workspaceId: String(row["workspace_id"]), initiativeId: String(row["initiative_id"]),
    clientId: (row["client_id"] as string | null) ?? null, status: row["status"] as Review["status"],
    note: (row["note"] as string | null) ?? null, decisionActorId: (row["decision_actor_id"] as string | null) ?? null,
    version: typeof row["version"] === "number" ? (row["version"] as number) : 1, createdAt: String(row["created_at"]),
  };
}

export function taskRow(t: Task): Record<string, unknown> {
  return {
    id: t.id, initiative_id: t.initiativeId, workspace_id: t.workspaceId, client_id: t.clientId, title: t.title,
    description: t.description, status: t.status, priority: t.priority, estimate: t.estimate, assignee_actor_id: t.assigneeActorId,
    order_index: t.order, dependency_ids: t.dependencyIds, version: t.version, created_at: t.createdAt, updated_at: t.updatedAt,
  };
}
export function toTask(row: Record<string, unknown>): Task {
  return {
    id: String(row["id"]), initiativeId: String(row["initiative_id"]), workspaceId: String(row["workspace_id"]),
    clientId: (row["client_id"] as string | null) ?? null, title: String(row["title"]), description: (row["description"] as string | null) ?? null,
    status: row["status"] as Task["status"], priority: row["priority"] as Task["priority"], estimate: (row["estimate"] as string | null) ?? null,
    assigneeActorId: (row["assignee_actor_id"] as string | null) ?? null, order: typeof row["order_index"] === "number" ? (row["order_index"] as number) : 0,
    dependencyIds: toStringArray(row["dependency_ids"]), version: typeof row["version"] === "number" ? (row["version"] as number) : 1,
    createdAt: String(row["created_at"]), updatedAt: String(row["updated_at"]),
  };
}

export function assignmentRow(a: Assignment): Record<string, unknown> {
  return { id: a.id, task_id: a.taskId, workspace_id: a.workspaceId, client_id: a.clientId, action: a.action, assignee_actor_id: a.assigneeActorId, assigned_by_actor_id: a.assignedByActorId, at: a.at };
}
export function toAssignment(row: Record<string, unknown>): Assignment {
  return {
    id: String(row["id"]), taskId: String(row["task_id"]), workspaceId: String(row["workspace_id"]), clientId: (row["client_id"] as string | null) ?? null,
    action: row["action"] as Assignment["action"], assigneeActorId: (row["assignee_actor_id"] as string | null) ?? null,
    assignedByActorId: String(row["assigned_by_actor_id"]), at: String(row["at"]),
  };
}

export function dependencyRow(d: Dependency): Record<string, unknown> {
  return { id: d.id, workspace_id: d.workspaceId, client_id: d.clientId, from_initiative_id: d.fromInitiativeId, to_initiative_id: d.toInitiativeId, type: d.type, created_at: d.createdAt };
}
export function toDependency(row: Record<string, unknown>): Dependency {
  return {
    id: String(row["id"]), workspaceId: String(row["workspace_id"]), clientId: (row["client_id"] as string | null) ?? null,
    fromInitiativeId: String(row["from_initiative_id"]), toInitiativeId: String(row["to_initiative_id"]), type: row["type"] as Dependency["type"], createdAt: String(row["created_at"]),
  };
}
