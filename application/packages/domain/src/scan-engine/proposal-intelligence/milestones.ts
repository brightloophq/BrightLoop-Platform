/* =============================================================================
 * Milestones (Sprint 11 §6) — PURE.
 *
 * One milestone per phase by default, sequenced by prerequisite. Includes
 * dependency validation, cycle detection, blocked-milestone detection, and a
 * deterministic topological order (id-sorted ties).
 *
 * Due windows are BANDS, never dates.
 * ========================================================================== */

import {
  milestoneSequenceSchema,
  proposalMilestoneSchema,
  type MilestoneSequence,
  type MilestoneStatus,
  type ProposalDeliverable,
  type ProposalMilestone,
  type ProposalPhase,
} from "@brightloop/schema";

export interface BuildMilestonesInput {
  idFor: (phase: ProposalPhase) => string;
  phases: readonly ProposalPhase[];
  deliverables?: readonly ProposalDeliverable[];
  ownerRoleFor?: (phase: ProposalPhase) => string | null;
  approverRoleFor?: (phase: ProposalPhase) => string | null;
}

/** One acceptance milestone per phase, each requiring the previous. Deterministic. */
export function buildMilestones(input: BuildMilestonesInput): ProposalMilestone[] {
  const ordered = [...input.phases].sort((a, b) => a.order - b.order);
  const milestones: ProposalMilestone[] = [];

  ordered.forEach((phase, i) => {
    const id = input.idFor(phase);
    const deliverableIds = (input.deliverables ?? []).filter((d) => phase.deliverableIds.includes(d.id)).map((d) => d.id).sort();
    milestones.push(
      proposalMilestoneSchema.parse({
        id,
        phaseId: phase.id,
        title: `${phase.kind} complete`,
        targetOutcome: phase.objective,
        deliverableIds,
        prerequisiteMilestoneIds: i === 0 ? [] : [milestones[i - 1]!.id],
        acceptanceCriteria: phase.exitCriteria,
        ownerRole: input.ownerRoleFor?.(phase) ?? null,
        approverRole: input.approverRoleFor?.(phase) ?? null,
        reviewGate: true,
        status: "proposed",
        dueWindow: phase.durationBand, // a band, never a date
        confidence: deliverableIds.length === 0 ? 40 : 80,
        limitations: deliverableIds.length === 0 ? ["No deliverables attached; the due window is indicative only."] : [],
      }),
    );
  });
  return milestones;
}

/**
 * Validate + sequence milestones: unknown prerequisites, self-references, cycles,
 * and blocked items (prerequisite absent from the set). The order is empty when a
 * cycle is present — a broken plan is never silently linearized. Deterministic.
 */
export function sequenceMilestones(milestones: readonly ProposalMilestone[]): MilestoneSequence {
  const ids = new Set(milestones.map((m) => m.id));
  const issues: MilestoneSequence["issues"] = [];
  const blocked: string[] = [];

  for (const m of milestones) {
    for (const p of m.prerequisiteMilestoneIds) {
      if (p === m.id) issues.push({ kind: "self_reference", milestoneIds: [m.id], detail: `${m.id} lists itself as a prerequisite` });
      else if (!ids.has(p)) {
        issues.push({ kind: "unknown_prerequisite", milestoneIds: [m.id], detail: `${m.id} requires unknown milestone '${p}'` });
        blocked.push(m.id);
      }
    }
  }

  // Kahn topological sort over known prerequisites, id-stable
  const indegree = new Map<string, number>([...ids].map((id) => [id, 0]));
  const adj = new Map<string, string[]>([...ids].map((id) => [id, []]));
  for (const m of milestones) {
    for (const p of m.prerequisiteMilestoneIds) {
      if (!ids.has(p) || p === m.id) continue;
      adj.get(p)!.push(m.id);
      indegree.set(m.id, (indegree.get(m.id) ?? 0) + 1);
    }
  }
  const ready = [...ids].filter((id) => (indegree.get(id) ?? 0) === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const next of adj.get(id)!.sort()) {
      indegree.set(next, indegree.get(next)! - 1);
      if (indegree.get(next) === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }

  const acyclic = order.length === ids.size;
  if (!acyclic) {
    const inCycle = [...ids].filter((id) => !order.includes(id)).sort();
    issues.push({ kind: "cycle", milestoneIds: inCycle, detail: `milestone cycle among: ${inCycle.join(", ")}` });
  }

  return milestoneSequenceSchema.parse({ order: acyclic ? order : [], blocked: [...new Set(blocked)].sort(), issues, acyclic });
}

/** Legal milestone status transitions (contract only). */
const TRANSITIONS: Record<MilestoneStatus, MilestoneStatus[]> = {
  proposed: ["approved", "deferred"],
  approved: ["in_progress", "blocked", "deferred"],
  in_progress: ["achieved", "blocked", "missed"],
  blocked: ["in_progress", "deferred", "missed"],
  achieved: [],
  missed: ["in_progress", "deferred"],
  deferred: ["proposed"],
};

export function canMilestoneTransition(from: MilestoneStatus, to: MilestoneStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Milestones whose prerequisites are not yet achieved. Pure. */
export function blockedMilestones(milestones: readonly ProposalMilestone[]): string[] {
  const achieved = new Set(milestones.filter((m) => m.status === "achieved").map((m) => m.id));
  const present = new Set(milestones.map((m) => m.id));
  return milestones
    .filter((m) => m.status !== "achieved" && m.prerequisiteMilestoneIds.some((p) => !achieved.has(p) && present.has(p)))
    .map((m) => m.id)
    .sort();
}
