/* =============================================================================
 * Use-cases: the post-scan COMMERCIAL package (proposal, narrative, review).
 *
 * Read paths return the LATEST version regardless of status — the ADMIN review
 * surface must see a needs_review draft, unlike the client-facing `getScanProposal`
 * / `getScanNarrative` which only ever expose an APPROVED artifact. The review
 * decision is an APPEND-ONLY runtime event (no new table): every approve /
 * request-revision / reject is recorded with the acting user, and the current
 * decision is a deterministic fold of that log. Approving requires the grant
 * authority capability (owner/admin) — strictly more than reading.
 *
 * Nothing here sends, publishes, or contacts the prospect.
 * ========================================================================== */

import { COMMERCIAL_STAGE_ORDER, RUNTIME_EVENTS, computePricingCompleteness, computeProposalPricingTotals } from "@brightloop/domain";
import { commercialProposalSchema, proposalItemPricingSchema, proposalPricingSchema, setProposalPricingInputSchema, type SetProposalPricingInput } from "@brightloop/schema";
import type { AppContext } from "../context.js";
import { SCAN_READ_CAP, SCAN_WRITE_CAP } from "../context.js";
import type { ArtifactDTO, NarrativeDTO } from "../dto.js";
import { toProposalDTO, toNarrativeDTO } from "../dto.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { loadAuthorizedRun } from "./shared.js";

const CLIENT_AUDIENCE = "client";

export type CommercialKickoffOutcome = "created" | "replayed" | "skipped" | "failed";

export interface CommercialAdvance {
  kickoff: CommercialKickoffOutcome;
  /** Commercial stage turns executed this call. */
  turns: number;
}

/** Turn ceiling for one synchronous advance — one turn per stage, plus a margin. */
const ADVANCE_MAX_TURNS = COMMERCIAL_STAGE_ORDER.length + 3;

/**
 * Server-authoritative advance of the post-scan commercial workflow.
 *
 * Idempotently ENQUEUES the first commercial job for a COMPLETED run, then DRIVES
 * the durable queue in bounded turns. This is the durable seam that does NOT depend
 * on the completion request's fragile tail (serverless kill) or on a client effect
 * firing after refresh — it runs synchronously wherever a completed scan is read
 * (the workspace loader on the post-completion refresh). The commercial stages are
 * pure/deterministic (no model call), so a whole package assembles in a handful of
 * fast turns during the render itself.
 *
 * Fully idempotent + resumable: enqueue is keyed on (jobType, runId, firstStage), a
 * completed job is never re-leased, and each stage artifact is content-addressed and
 * superseded — so calling this on every render never duplicates work. Returns the
 * kickoff outcome so a `failed` enqueue is surfaced, never silently swallowed.
 */
export async function advanceCommercialWorkflow(ctx: AppContext, rawRunId: unknown, opts: { maxTurns?: number } = {}): Promise<CommercialAdvance> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_READ_CAP);
  if (run.status !== "completed") return { kickoff: "skipped", turns: 0 }; // only exists after the core scan completes

  const started = await ctx.services.commercial.ensureStarted({ runId: run.id, scanId: run.scanId, clientId: run.clientId });
  if (!started.ok) return { kickoff: "failed", turns: 0 };

  const owner = `internal:${ctx.actor.userId}`;
  const max = opts.maxTurns ?? ADVANCE_MAX_TURNS;
  let turns = 0;
  for (; turns < max; turns += 1) {
    const t = await ctx.services.commercial.runCommercialOnce(owner);
    if (!t.ok || t.value === null) break; // a stage failed (queue owns retry) or the queue is idle
  }
  return { kickoff: started.code === "created" ? "created" : "replayed", turns };
}

/** The latest commercial proposal DRAFT (any status) — for the admin review surface. */
export async function getScanCommercialProposal(ctx: AppContext, rawRunId: unknown): Promise<ArtifactDTO> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_READ_CAP);
  const latest = unwrap(await ctx.services.proposals.latest(run.id), { not_found: () => new NotFoundError("commercial proposal") });
  return toProposalDTO(latest);
}

/** The latest client narrative (any status) — for the admin review surface. */
export async function getScanClientNarrative(ctx: AppContext, rawRunId: unknown): Promise<NarrativeDTO> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_READ_CAP);
  const latest = unwrap(await ctx.services.narratives.latest(run.id, CLIENT_AUDIENCE), { not_found: () => new NotFoundError("client narrative") });
  return toNarrativeDTO(latest);
}

/* ---- Admin pricing ----------------------------------------------------------
 * Admin-entered pricing is authoritative — AI never sets a final price. The client
 * supplies price lines only; the server computes the totals (integer minor units),
 * derives completeness, and SUPERSEDES the proposal version so history is preserved
 * and the change is attributed. Pricing NEVER approves the proposal — status is
 * carried through unchanged; approval remains a separate, explicit human action.
 * -------------------------------------------------------------------------- */

export type { SetProposalPricingInput };

/**
 * Persist admin pricing for the latest commercial proposal draft. Requires the
 * internal scan-write capability (owner/admin/team_member); client roles are denied
 * by the capability + RLS. Validates every priced line against a real recommended
 * work item (no phantom pricing), computes totals server-side, sets `commercialState`
 * from completeness, supersedes the version, and appends a safe audit event.
 */
export async function setProposalPricing(ctx: AppContext, rawRunId: unknown, rawInput: unknown): Promise<ArtifactDTO> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_WRITE_CAP);

  const parsed = setProposalPricingInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError("Invalid pricing input", { pricing: parsed.error.issues[0]?.message ?? "invalid" });
  }
  const input = parsed.data;

  const prior = unwrap(await ctx.services.proposals.latest(run.id), { not_found: () => new NotFoundError("commercial proposal") });
  if (prior.version !== input.expectedVersion) {
    throw new ConflictError("The proposal changed. Reload the current pricing before saving.");
  }
  const proposal = commercialProposalSchema.parse(prior.envelope);
  const priorPricing = proposal.pricing;
  const priorLines = new Map((priorPricing?.items ?? []).map((line) => [line.sourceId, line]));
  const items = input.items.map((line) => {
    const old = priorLines.get(line.sourceId);
    return proposalItemPricingSchema.parse({
      ...line,
      cadence: line.cadence !== undefined ? line.cadence : old?.cadence ?? null,
      quantity: line.quantity ?? old?.quantity ?? 1,
      optional: line.optional ?? old?.optional ?? false,
      adminNotes: line.adminNotes ?? old?.adminNotes ?? "",
    });
  });

  // Pricing only applies to a real draft — an insufficient-evidence stub has no
  // authoritative work to price.
  if (proposal.status !== "draft_ready") {
    throw new ValidationError("This proposal has no draft to price", { status: proposal.status });
  }
  // Never price phantom work: every line must reference a real recommended item.
  const workIds = new Set(proposal.recommendedWork.map((w) => w.sourceId));
  const unknownIds = items.filter((i) => !workIds.has(i.sourceId)).map((i) => i.sourceId);
  if (unknownIds.length > 0) {
    throw new ValidationError("Pricing references unknown work items", { sourceIds: unknownIds.join(",") });
  }
  // One price line per work item — a duplicate sourceId is ambiguous.
  const seen = new Set<string>();
  for (const line of items) {
    if (seen.has(line.sourceId)) throw new ValidationError("Duplicate pricing for a work item", { sourceId: line.sourceId });
    seen.add(line.sourceId);
  }

  const discountMinor = input.discountMinor ?? priorPricing?.discountMinor ?? 0;
  const totals = computeProposalPricingTotals(items, discountMinor);
  const pricing = proposalPricingSchema.parse({
    currency: input.currency ?? priorPricing?.currency ?? "USD",
    items,
    discountMinor: totals.discountMinor,
    subtotalOneTimeMinor: totals.subtotalOneTimeMinor,
    totalOneTimeMinor: totals.totalOneTimeMinor,
    totalRecurringMonthlyMinor: totals.totalRecurringMonthlyMinor,
    validUntil: input.validUntil !== undefined ? input.validUntil : priorPricing?.validUntil ?? null,
    commercialNotes: input.commercialNotes ?? priorPricing?.commercialNotes ?? "",
    pricedBy: ctx.actor.userId,
    pricedAt: ctx.clock(),
  });
  const completeness = computePricingCompleteness(proposal.recommendedWork, pricing);

  // Supersede the version with pricing filled in; STATUS IS CARRIED THROUGH — pricing
  // never approves. Only `commercialState` moves (needs_pricing → priced when complete).
  const nextEnvelope: Record<string, unknown> = { ...(prior.envelope as Record<string, unknown>), pricing, commercialState: completeness.state };
  const saved = unwrap(await ctx.services.proposals.supersede(prior, nextEnvelope, prior.status), {
    conflict: () => new ConflictError("The proposal changed while saving. Reload the current pricing and try again."),
  });

  unwrap(
    await ctx.services.events.emit({
      eventType: RUNTIME_EVENTS.proposalPricingUpdated,
      aggregateType: "intelligence_run",
      aggregateId: run.id,
      clientId: run.clientId,
      runId: run.id,
      scanId: run.scanId,
      payload: {
        by: ctx.actor.userId,
        proposalVersionId: saved.id,
        version: saved.version,
        currency: pricing.currency,
        pricedItemCount: pricing.items.length,
        hasRecurring: pricing.totalRecurringMonthlyMinor > 0,
        hasDiscount: pricing.discountMinor > 0,
        commercialState: completeness.state,
      },
    }),
  );

  return toProposalDTO(saved);
}

export {
  getProspectPackageReview, decideProspectPackage,
  type ProspectPackageReviewDTO, type PackageReviewAction, type DecideProspectPackageInput,
} from "./commercial-review.js";
