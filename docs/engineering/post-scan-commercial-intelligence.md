# Post-Scan Commercial Intelligence

Turns a completed prospect scan into a commercially usable, evidence-grounded
prospect package **without weakening the evidence-first architecture** and
**without destabilising the working 13-stage scanner**.

Status: **complete through the human review gate.** One click (Run Full Scan)
runs the core scan and then, automatically and server-side, the commercial
workflow — competitor intelligence → proposal draft → client narrative —
terminating in front of a human review gate. Nothing is auto-approved or sent.
Deferred (documented, not forced): prospect→lead/client conversion and commercial
pricing/quote editing.

## The core / commercial boundary

```
CORE INTELLIGENCE PIPELINE (unchanged — 13 stages, queue-driven)
Website → Discovery → Evidence → Graph → Reasoning → … → report_assembly
                                                              │  runtime.run.completed
                                                              ▼
POST-SCAN COMMERCIAL PIPELINE (a SEPARATE scheduler)
Completed scan → Competitor Intelligence → Proposal → Narrative → READY FOR REVIEW → (human) Approve
```

The core scanner is stable and is **preserved**. The commercial pipeline is a
**separate post-scan workflow**, not new core stages: adding stages would reorder
the 13-stage runtime, and the core coordinator's `settleJob → enqueueNext` is
hardwired to `pipeline.nextStage`. The commercial workflow runs on its own
scheduler (`CommercialCoordinator`) over the same durable Postgres queue
primitives (arbitrary `jobType`, idempotent keys, backoff, dead-letter), attached
at the single point where a run completes.

## Final commercial stage order

`COMMERCIAL_STAGE_ORDER` (`@brightloop/domain` → `runtime/commercial/stages.ts`):

1. `competitor_intelligence` — evidence-only discovery → revised `competitor_snapshot`.
2. `proposal_generation` — compose a proposal draft → `proposal_versions`.
3. `narrative_generation` — compose a client narrative → `narrative_versions` (audience `client`).

The human **review gate is deliberately NOT a stage** — the workflow terminates in
front of it (emitting `runtime.commercial.ready_for_review`); approval is a
separate, capability-gated human action.

## Why the three sections were incomplete (diagnosis)

Each capability already existed in **two layers**: (1) the lightweight C8/C9/C10
runtime snapshots wired into the pipeline (evidence-only, provider-free, always
`available|unavailable`) — C8 reads only `source === "competitors"` evidence, which
*nothing produced*, so it was permanently `unavailable`; and (2) the rich AIS
builders (AIS-005 competitor, AIS-004 proposal, AIS-001 narrative) — authored and
tested but **unwired**.

**Key architectural decision — compose, don't force the rich builders.** Wiring the
rich AIS-004/AIS-001 builders directly from the persisted artifacts is *not*
possible without fabricating fields the evidence does not contain: `EngineRecommendation`
requires `findingIds` (min 1, no source in the `recommendation_candidates`
envelope), `tier`, `timeHorizon`, `evidenceState`; the narrative builder needs a
reconstructed `InternalIntelligenceReport` the persisted C6 projection cannot
supply. Seeding those would manufacture scope/phase/milestone specificity beyond the
evidence — a direct violation of the non-negotiable no-fabrication rule. So the
proposal and narrative stages **compose** already-verified intelligence (the C9
proposal snapshot, the report projection, the C8 competitor snapshot) into compact,
fully-traceable artifacts. No second recommendation engine; nothing invented.

## Competitor discovery — evidence-only

`@brightloop/domain` → `scan-engine/competitor-discovery/`. **Never invent a
competitor.** Seeds come only from the prospect's own outbound references
(`externalLinks`/`socialLinks` in the `discovery_manifest`, previously discarded)
and admin-supplied domains (`manual_input`). Every seed passes the AIS-005 identity
validator (directories, social, marketplaces, suppliers, the client itself,
evidence-less candidates → rejected or `ambiguous`, never asserted). Each validated
competitor becomes a `source:"competitors"` evidence item with **provenance only**
(entity + referencing pages), state `inferred`; the deterministic C8 step produces
the `competitor_snapshot`. No references + nothing supplied ⇒ `insufficient_evidence`
(a legitimate COMPLETED outcome, ≠ *not run*). Pure/deterministic; identical inputs →
identical checksum.

## Proposal grounding + the pricing rule

`scan-engine/commercial-proposal/assemble.ts` — pure, deterministic, offline.
Composes the C9 `proposal` snapshot (verified recommended work, each item keeping
its evidence ids), the report projection (executive summary, observed situation,
risks → key issues, opportunities), and the C8 competitor snapshot (context). Items
without evidence are dropped; an unavailable C9 snapshot ⇒ `insufficient_evidence`
with nothing fabricated. Bounded (≤8 work items, ≤6 issues/opportunities, bounded
field lengths). Content-addressed → idempotent revisions in `proposal_versions`.

**Pricing is NEVER invented.** No authoritative pricing configuration exists, so the
proposal is always `commercialState = needs_pricing` with `pricing = null`, while
still being `draft_ready`. Draft-ready and priced are distinct. When authoritative
commercial terms are later supplied (an admin/config action — a deferred increment),
`commercialState` flips to `priced`; AI never sets a price, discount, term, ROI, or
timeline.

## Narrative grounding — presentation only

`scan-engine/client-narrative/assemble.ts` — pure, deterministic, offline, **no
LLM**. Transforms the verified report + proposal + competitor into the six
client-facing sections (observed / challenges / opportunities / recommendation /
rationale / next step) using fixed templates filled with **copied** values. It
introduces no new factual claim; every section carries the `supportingArtifacts` it
was composed from; unavailability is stated plainly ("No recommended work could be
evidenced yet"), never invented. Confidence is carried from the source, never
recomputed. `reviewRequired` by default. Persisted to `narrative_versions`
(audience `client`), content-addressed → idempotent.

## Human review gate

Generated commercial material is **never** auto-visible or auto-sent. Lifecycle:
`generated → needs_review → approved | revision_requested | rejected`. The decision
is an **append-only runtime event** (`runtime.review.{approved,revision_requested,
rejected}`) carrying the acting user — **no new table, no migration**. The current
decision is a deterministic **last-writer-wins fold** of that event log
(`getProspectPackageReview`). The existing `public.approvals` table was rejected for
reuse (its `subject_type` enum is bounded and `client_id` is `NOT NULL`, but prospect
scans are internal and often client-less), as was the Phase-D `Review` entity (bound
to workspace/initiative, post-certification).

**Package readiness** (`computeProspectPackage`, pure) folds the four components +
review decision into one honest state: `not_started | running | blocked |
ready_for_review | approved | revision_requested | rejected`. Competitor
`insufficient_evidence` does **not** block; a proposal draft and a narrative must
exist; **missing pricing does not block review readiness**. A generated package is
`ready_for_review`, never silently `approved`.

## One-click orchestration, failure & resume

`run-until-wait`, on `lifecycle === "completed"`, calls `triggerCommercialWorkflow`
(`apps/web/.../commercial-run.ts`): a **server-side**, bounded, idempotent drive of
`enqueueForCompletedRun` + `runCommercialOnce` (up to `COMMERCIAL_STAGE_ORDER.length
+ 3` turns) in the same request, so the browser's post-completion refresh already
sees the package. Not browser-driven; best-effort (a commercial failure never fails
the completed core run). Idempotent on `(jobType, runId, stage)`: a refresh/replay
re-enqueues stage 0, but completed jobs are not re-leased, so no stage re-runs and no
duplicate artifact is written (each artifact is content-addressed and superseded, not
rewritten). A failed stage dead-letters via the queue's normal policy; the package
surfaces `blocked` with the stopping point. Partial workflows resume from the queue.

## Authorization / RLS

Reads require `transformation.read`; the review **decision** requires the grant
authority `transformation.approve` (owner/admin — team_member cannot approve). Client
roles are denied at the API boundary *and* by RLS (the `intelligence_artifacts`,
`proposal_versions`, `narrative_versions`, `runtime_events` tables are
`bl_is_internal()`-only). No RLS change; no service-role bypass.

## Observability

`runtime.commercial.{enqueued, stage_completed, competitor_discovered,
proposal_generated, narrative_generated, completed, ready_for_review}` and
`runtime.review.{approved, revision_requested, rejected}` — status, counts and safe
flags only (needsPricing, reviewStatus), never entities, evidence bodies, or raw
provider output. No migration (`event_type` is text).

## AI cost control

The whole commercial workflow is **pure/deterministic — no model call**, so the
`#94/#97` truncation class of defect cannot recur here by construction. Any future
commercial LLM step MUST reuse the hardened execution path (compact bounded output
contract, strict JSON, completion-over-verbosity, safe validation-retry, cost
ceiling, timeout, provider telemetry, no raw-response logging) by generalising its
three `execution_outcomes`-specific seams — never by forking a second uncontrolled
path.

## Persistence

| Artifact | Table | Idempotency |
|---|---|---|
| competitor snapshot | `intelligence_artifacts` (kind `competitor_snapshot`) | content-addressed; revised only on new content |
| proposal draft | `proposal_versions` (previously unwired) | content-addressed; superseding versions |
| client narrative | `narrative_versions` (audience `client`) | content-addressed; per-audience supersedes chain |
| review decision | `runtime_events` (append-only) | monotonic per-aggregate sequence |

**No migration** was required: the version tables and their adapters already
existed; the review gate rides the append-only event log.

## Deferred (documented, not forced)

- **Prospect → lead/client conversion.** No auto-convert. The CRM lifecycle
  (`lead: new→qualified→proposal_sent→won`; `client: prospect→member→…`) exists, but
  scan→lead/client conversion is an explicit unbuilt TODO in `delivery-actions.ts`
  and belongs to a dedicated increment.
- **Commercial pricing / quote editing.** Requires a pricing/catalog subsystem; until
  then the package shows *Pricing required* and remains reviewable.
- **Rich AIS-004/AIS-001 builder wiring.** Would need evidence-linkage work
  (deriving `findingIds`, reconstructing the report) to feed the builders without
  fabrication — a larger, separate effort.

## Roadmap

| # | Increment | Status |
|---|---|---|
| 1 | Competitor Discovery producer (pure domain + tests) | **landed** |
| 2 | Commercial workflow engine — separate `CommercialCoordinator`, `commercial_intelligence` jobType | **landed** |
| 3 | Orchestration trigger + coherent commercial status model + competitor UX | **landed** |
| 4 | Proposal stage — compact evidence-only draft (needs_pricing) + narrative stage — client-facing presentation | **landed** |
| 5 | Package readiness + human review gate (append-only events, capability-gated) | **landed** |
| 6 | Prospect Package command center + review UX | **landed** |
| 7 | Prospect → lead/client conversion; commercial pricing editing | deferred |

Non-negotiables throughout: no fabricated competitors/evidence/pricing/ROI, no
auto-send, no auto-convert, no weakened RLS/queue/idempotency, no raised provider
budgets to mask output control, no raw provider-response logging, no destabilising
the working Full Scan.
