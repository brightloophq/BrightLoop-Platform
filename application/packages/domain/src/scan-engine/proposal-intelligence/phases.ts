/* =============================================================================
 * Phasing & timeline (Sprint 11 §5 · AIS-004 §03) — PURE.
 *
 * "Phases are cut along the move dependency DAG so prerequisites precede
 * dependents and each phase delivers standalone value."
 *
 * HARD RULE: durations are BANDS. The engine never invents an exact date when only
 * a band is known — `durationBand` is the only temporal output.
 * ========================================================================== */

import {
  proposalPhaseSchema,
  type DurationBand,
  type PhaseKind,
  type ProposalDeliverable,
  type ProposalPhase,
  type ProposalWorkstream,
} from "@brightloop/schema";

/** Canonical phase order (AIS-004 P1–P6 collapsed to the delivery arc). */
export const PHASE_ORDER: readonly PhaseKind[] = ["discovery", "stabilize", "build", "optimize", "future"];

const BAND_WEIGHT: Record<DurationBand, number> = { days: 1, weeks: 2, one_month: 3, quarter: 4, multi_quarter: 5, unavailable: 0 };
const WEIGHT_BAND: DurationBand[] = ["unavailable", "days", "weeks", "one_month", "quarter", "multi_quarter"];

/** The longest band across a set — never a summed "exact" duration. Pure. */
export function aggregateDurationBand(bands: readonly DurationBand[]): DurationBand {
  const known = bands.filter((b) => b !== "unavailable");
  if (known.length === 0) return "unavailable";
  return WEIGHT_BAND[Math.max(...known.map((b) => BAND_WEIGHT[b]))]!;
}

/** Which phase a workstream belongs in, from its tier and dependency depth. Pure. */
export function phaseKindFor(workstream: ProposalWorkstream, depth: number): PhaseKind {
  if (workstream.tier === "critical_risk") return "stabilize";
  if (depth === 0 && workstream.effortBand === "xs") return "discovery";
  if (depth >= 2) return "optimize";
  return "build";
}

/** Dependency depth per workstream (0 = no prerequisites). Cycles cap at the set size. Pure. */
export function dependencyDepths(workstreams: readonly ProposalWorkstream[]): Map<string, number> {
  const byRec = new Map<string, ProposalWorkstream>();
  for (const w of workstreams) for (const r of w.recommendationIds) byRec.set(r, w);
  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const compute = (w: ProposalWorkstream): number => {
    if (depth.has(w.id)) return depth.get(w.id)!;
    if (visiting.has(w.id)) return 0; // cycle guard — depth contribution stops here
    visiting.add(w.id);
    const parents = w.dependencies.map((d) => byRec.get(d)).filter((x): x is ProposalWorkstream => x !== undefined && x.id !== w.id);
    const d = parents.length === 0 ? 0 : Math.max(...parents.map(compute)) + 1;
    visiting.delete(w.id);
    depth.set(w.id, Math.min(d, workstreams.length));
    return depth.get(w.id)!;
  };

  for (const w of [...workstreams].sort((a, b) => (a.id < b.id ? -1 : 1))) compute(w);
  return depth;
}

export interface BuildPhasesInput {
  idFor: (kind: PhaseKind) => string;
  workstreams: readonly ProposalWorkstream[];
  deliverables?: readonly ProposalDeliverable[];
  objectiveFor?: (kind: PhaseKind) => string;
}

const DEFAULT_OBJECTIVES: Record<PhaseKind, string> = {
  discovery: "Establish the baseline and confirm the evidence before committing effort.",
  stabilize: "Close critical risks so the business is safe to build on.",
  build: "Deliver the core evidence-linked improvements.",
  optimize: "Compound the gains and address dependent moves.",
  future: "Deferred moves to revisit once prerequisites and evidence allow.",
};

/**
 * Build phases from the workstream dependency DAG. Only phases with content are
 * emitted — an empty phase is never padded with invented work. Deterministic.
 */
export function buildPhases(input: BuildPhasesInput): ProposalPhase[] {
  const depths = dependencyDepths(input.workstreams);
  const byPhase = new Map<PhaseKind, ProposalWorkstream[]>();

  for (const w of [...input.workstreams].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const kind = phaseKindFor(w, depths.get(w.id) ?? 0);
    byPhase.set(kind, [...(byPhase.get(kind) ?? []), w]);
  }

  const phases: ProposalPhase[] = [];
  let order = 0;
  for (const kind of PHASE_ORDER) {
    const list = byPhase.get(kind);
    if (list === undefined || list.length === 0) continue; // no empty phases
    const wsIds = list.map((w) => w.id);
    const deliverableIds = (input.deliverables ?? []).filter((d) => wsIds.includes(d.workstreamId)).map((d) => d.id).sort();
    const priorPhaseIds = phases.map((p) => p.id);

    phases.push(
      proposalPhaseSchema.parse({
        id: input.idFor(kind),
        kind,
        order: order++,
        objective: input.objectiveFor?.(kind) ?? DEFAULT_OBJECTIVES[kind],
        workstreamIds: wsIds,
        deliverableIds,
        dependencies: priorPhaseIds, // each phase depends on the ones before it
        milestoneIds: [],
        durationBand: aggregateDurationBand(list.map((w) => w.durationBand)),
        entryCriteria: priorPhaseIds.length === 0 ? ["Proposal approved"] : [`Phase ${priorPhaseIds.length} exit criteria met`],
        exitCriteria: [`All ${deliverableIds.length} deliverable(s) accepted`],
        risks: [],
        approvals: ["client_approval"],
        measurableOutcomes: list.flatMap((w) => w.affectedDomains).map((d) => `Movement in ${d}`),
        limitations: deliverableIds.length === 0 ? ["No deliverables attached to this phase yet."] : [],
      }),
    );
  }
  return phases;
}

/** Attach milestone ids to their phase. Returns new values. Pure. */
export function attachMilestones(phases: readonly ProposalPhase[], milestonesByPhase: ReadonlyMap<string, string[]>): ProposalPhase[] {
  return phases.map((p) => ({ ...p, milestoneIds: [...(milestonesByPhase.get(p.id) ?? [])].sort() }));
}
