import { COMMERCIAL_STAGE_ORDER, RUNTIME_EVENTS, computePricingCompleteness, computeProposalPricingTotals, type RuntimeEventName, type RuntimeResult } from "@brightloop/domain";
import { clientNarrativeSchema, commercialProposalSchema, commercialReviewBindingSchema, type CommercialReviewBinding } from "@brightloop/schema";
import type { AppContext } from "../context.js";
import { PACKAGE_REVIEW_CAP, SCAN_READ_CAP } from "../context.js";
import { ConflictError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { loadAuthorizedRun } from "./shared.js";
import { computeProspectPackage, type PackageReviewDecision, type ProspectPackage } from "./package-readiness.js";

export type PackageReviewAction = "approve" | "request_revision" | "reject";
const ACTION_EVENT: Record<PackageReviewAction, RuntimeEventName> = {
  approve: RUNTIME_EVENTS.reviewApproved,
  request_revision: RUNTIME_EVENTS.reviewRevisionRequested,
  reject: RUNTIME_EVENTS.reviewRejected,
};
const DECISION: Record<string, PackageReviewDecision> = {
  [RUNTIME_EVENTS.reviewApproved]: "approved",
  [RUNTIME_EVENTS.reviewRevisionRequested]: "revision_requested",
  [RUNTIME_EVENTS.reviewRejected]: "rejected",
};
const ref = (r: { id: string; version: number; checksum: string }) => ({ id: r.id, version: r.version, checksum: r.checksum });
async function nullable<T>(p: Promise<RuntimeResult<T>>): Promise<T | null> {
  const r = await p;
  return r.ok ? r.value : r.code === "not_found" ? null : unwrap(r);
}

/** Key order is irrelevant; every field is allowlisted by the binding schema. */
export function sameReviewBinding(a: CommercialReviewBinding, b: CommercialReviewBinding): boolean {
  return (["proposal", "narrative", "report", "competitor", "coreProposal"] as const).every((key) => {
    const x = a[key]; const y = b[key];
    return x === null || y === null ? x === y : x.id === y.id && x.version === y.version && x.checksum === y.checksum;
  });
}

/** Dates are inclusive through the stated UTC calendar day; unset is not valid. */
export function commercialTermsValid(validUntil: string | null, now: string): boolean {
  if (validUntil === null || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return false;
  const date = new Date(`${validUntil}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === validUntil && validUntil >= now.slice(0, 10);
}

export interface ProspectPackageReviewDTO {
  /** Effective decision. Legacy/stale events are retained, but never authorize. */
  decision: PackageReviewDecision;
  recordedDecision: PackageReviewDecision;
  bindingStatus: "pending" | "legacy" | "stale" | "current";
  currentBinding: CommercialReviewBinding | null;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string | null;
  readiness: ProspectPackage;
}

export async function getProspectPackageReview(ctx: AppContext, rawRunId: unknown): Promise<ProspectPackageReviewDTO> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_READ_CAP);
  const query = { aggregateType: "intelligence_run", aggregateId: run.id, descending: true, limit: 1 };
  const [proposal, narrative, report, competitor, coreProposal, decisions, stageEvents] = await Promise.all([
    nullable(ctx.services.proposals.latest(run.id)),
    nullable(ctx.services.narratives.latest(run.id, "client")),
    ctx.services.artifacts.latest(run.id, "internal_intelligence_report").then(unwrap),
    ctx.services.artifacts.latest(run.id, "competitor_snapshot").then(unwrap),
    ctx.services.artifacts.latest(run.id, "proposal").then(unwrap),
    ctx.services.events.list({ ...query, eventTypes: Object.keys(DECISION) }).then(unwrap),
    Promise.all(COMMERCIAL_STAGE_ORDER.map((stage) => ctx.services.events.list({
      ...query, stage, eventTypes: [RUNTIME_EVENTS.commercialStageFailed, RUNTIME_EVENTS.commercialStageCompleted,
        RUNTIME_EVENTS.jobDeadLettered, RUNTIME_EVENTS.commercialEnqueueFailed, RUNTIME_EVENTS.commercialEnqueued],
    }).then(unwrap))),
  ]);
  const binding: CommercialReviewBinding | null = proposal && narrative && report ? {
    schemaVersion: 1, proposal: ref(proposal), narrative: ref(narrative), report: ref(report),
    competitor: competitor ? ref(competitor) : null, coreProposal: coreProposal ? ref(coreProposal) : null,
  } : null;
  const last = decisions[0];
  const bound = commercialReviewBindingSchema.safeParse(last?.payload["binding"]);
  const bindingStatus = !last ? "pending" : !bound.success ? "legacy" : binding && sameReviewBinding(bound.data, binding) ? "current" : "stale";
  const recordedDecision = last ? DECISION[last.eventType]! : "pending";
  const decision = bindingStatus === "current" ? recordedDecision : "pending";
  const parsed = commercialProposalSchema.safeParse(proposal?.envelope);
  const parsedNarrative = clientNarrativeSchema.safeParse(narrative?.envelope);
  const pricing = parsed.success ? parsed.data.pricing : null;
  const totals = pricing ? computeProposalPricingTotals(pricing.items, pricing.discountMinor) : null;
  const pricingValid = pricing !== null && totals !== null && Object.values(totals).every(Number.isSafeInteger) &&
    pricing.items.every((line) => parsed.success && parsed.data.recommendedWork.some((w) => w.sourceId === line.sourceId)) &&
    new Set(pricing.items.map((i) => i.sourceId)).size === pricing.items.length &&
    pricing.subtotalOneTimeMinor === totals.subtotalOneTimeMinor && pricing.totalOneTimeMinor === totals.totalOneTimeMinor &&
    pricing.totalRecurringMonthlyMinor === totals.totalRecurringMonthlyMinor;
  const failures = new Set<string>([RUNTIME_EVENTS.commercialStageFailed, RUNTIME_EVENTS.jobDeadLettered, RUNTIME_EVENTS.commercialEnqueueFailed]);
  const commercialFailed = stageEvents.some((events) => events[0] !== undefined && failures.has(events[0].eventType));
  const readiness = computeProspectPackage({
    scanCompleted: run.status === "completed", reportPresent: report?.validationStatus === "valid",
    competitor: competitor ? (competitor.validationStatus === "invalid" ? "failed" : competitor.envelope["status"] === "available" ? "ready" : "insufficient_evidence") : stageEvents[0]?.[0]?.eventType === RUNTIME_EVENTS.commercialStageCompleted ? "insufficient_evidence" : "not_started",
    proposal: parsed.success && parsed.data.status === "draft_ready" && coreProposal?.validationStatus !== "invalid" ? "needs_review" : "not_started",
    narrative: parsedNarrative.success && parsedNarrative.data.status === "ready" && parsedNarrative.data.sections.length > 0 ? "needs_review" : "not_started",
    commercialFailed, commercialEnqueued: stageEvents.some((events) => events.length > 0), reviewDecision: decision,
    approvalCurrent: bindingStatus === "current", pricingValid,
    pricingComplete: parsed.success && computePricingCompleteness(parsed.data.recommendedWork, pricing).complete,
    termsValid: commercialTermsValid(pricing?.validUntil ?? null, ctx.clock()),
  });
  return { decision, recordedDecision, bindingStatus, currentBinding: binding,
    decidedBy: last?.actor ?? (typeof last?.payload["by"] === "string" ? last.payload["by"] : null),
    decidedAt: last?.occurredAt ?? null, note: typeof last?.payload["note"] === "string" ? last.payload["note"] : null, readiness };
}

export interface DecideProspectPackageInput {
  action: PackageReviewAction;
  expectedBinding: CommercialReviewBinding;
  note?: string;
}

export async function decideProspectPackage(ctx: AppContext, rawRunId: unknown, input: DecideProspectPackageInput): Promise<ProspectPackageReviewDTO> {
  const run = await loadAuthorizedRun(ctx, rawRunId, PACKAGE_REVIEW_CAP);
  if (!Object.hasOwn(ACTION_EVENT, input.action)) throw new ValidationError("Invalid review action");
  const expected = commercialReviewBindingSchema.safeParse(input.expectedBinding);
  if (!expected.success) throw new ValidationError("A reviewed version binding is required");
  const current = await getProspectPackageReview(ctx, run.id);
  if (!current.currentBinding || !sameReviewBinding(expected.data, current.currentBinding)) {
    throw new ConflictError("The package changed. Reload and review the current versions.");
  }
  if (!current.readiness.componentsReady) throw new ConflictError("The package is not ready for review");
  // The database repeats this comparison under the SAME transaction lock used by
  // every version/source writer. This application read is not the atomic guard.
  unwrap(await ctx.services.events.emit({
    eventType: ACTION_EVENT[input.action], aggregateType: "intelligence_run", aggregateId: run.id,
    clientId: run.clientId, runId: run.id, scanId: run.scanId,
    payload: { by: ctx.actor.userId, binding: current.currentBinding,
      ...(typeof input.note === "string" ? { note: input.note.slice(0, 500) } : {}) },
  }), { serialization_conflict: () => new ConflictError("The package changed. Reload and review the current versions.") });
  return getProspectPackageReview(ctx, run.id);
}
