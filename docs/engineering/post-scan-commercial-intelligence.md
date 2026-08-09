# Post-Scan Commercial Intelligence

Turns a completed prospect scan into a commercially usable, evidence-grounded
prospect package **without weakening the evidence-first architecture** and
**without destabilising the working 13-stage scanner**.

Status: **in progress.** Increment 1 (the evidence-only Competitor Discovery
producer) has landed as a pure, tested domain module. The post-scan workflow
engine, persistence wiring, status model, review gate, and UX follow in
subsequent increments (see *Roadmap* below).

## The core / commercial boundary

```
CORE INTELLIGENCE PIPELINE (unchanged — 13 stages, queue-driven)
Website → Discovery → Evidence → Graph → Reasoning → … → report_assembly
                                                              │  runtime.run.completed
                                                              ▼
POST-SCAN COMMERCIAL PIPELINE (new — a SEPARATE scheduler)
Completed Report → Competitor Intelligence → Proposal → Narrative → Human Review
```

The core scanner is stable and is **preserved**. The commercial pipeline is a
**separate post-scan workflow**, not new core stages. This is deliberate: adding
stages would reorder the 13-stage runtime (a runtime redesign), and the core
coordinator's `settleJob → enqueueNext` is hardwired to `pipeline.nextStage`
(the core stage order). The commercial workflow therefore runs on its own
scheduler over the same durable Postgres queue primitives (arbitrary `jobType`,
idempotent keys, backoff, dead-letter, checkpoints), attached at the single
point where a run completes.

## Why the three sections were incomplete (diagnosis)

Each capability already existed in **two layers**:

1. **Lightweight runtime snapshots (live, wired into the pipeline).** C8
   competitor / C9 proposal / C10 narrative run as deterministic sub-steps inside
   `finding_synthesis` / `recommendation_candidates` / `report_assembly`. They are
   evidence-only and provider-free. C8 reads **only** evidence with
   `source === "competitors"` — and *nothing in the codebase produces that
   source* (the crawler emits `website` / `pages`), so C8 correctly and
   permanently emits `unavailable` / `no_competitor_evidence`. C9 persists a
   structured `proposal` snapshot (not a final proposal document). C10 always
   sets `reviewRequired = true`.

2. **Rich AIS builders (authored, tested, UNWIRED).** The AIS-005 competitor
   framework (candidate → identity → similarity → rank → benchmark → gap), the
   AIS-004 proposal artifact (`proposalArtifactSchema`, lifecycle
   `draft → internal_review → approved_for_send → …`, `investmentInputs` that
   computes **no** pricing), and the AIS-001 narrative artifact
   (`narrativeArtifactSchema`, audience-targeted, citation-safe) are complete and
   tested but invoked nowhere in `application/src` / `apps/web`.

So the work is largely **wire + orchestrate + add a discovery producer + review
gate + status model + UX** — reusing tested engines, never rewriting them.

## Competitor discovery — evidence-only (Increment 1, landed)

`@brightloop/domain` → `scan-engine/competitor-discovery/`.

**Absolute rule: never invent a competitor.** A competitor appears in the final
artifact only with verifiable evidence for the entity.

- **Sources (no new provider, no search, no scraping):**
  - the prospect's **own outbound references** — `externalLinks` / `socialLinks`
    already captured by the crawler and persisted in the `discovery_manifest`
    envelope (previously discarded downstream);
  - **admin-supplied** competitor domains (recorded as `manual_input` evidence).
- **Gate:** every seed passes the AIS-005 identity validator
  (`validatePool`) — directories, social networks, marketplaces, suppliers, the
  client itself, parent/franchise variants, non-commercial, and evidence-less
  candidates are rejected or marked `ambiguous`. **Ambiguous is surfaced for
  human review, never asserted.**
- **Evidence, not assertion:** each validated competitor becomes a
  `source:"competitors"` evidence item with **provenance only** — the entity and
  the pages that reference it — and **no invented signal/statement**. State is
  `inferred` (the entity is observed; the rivalry is inferred → review). The
  deterministic C8 step then produces the `competitor_snapshot`.
- **No-evidence behaviour:** no references and nothing supplied ⇒ C8 emits
  `unavailable` / `no_competitor_evidence` — a **legitimate COMPLETED outcome**
  (`insufficient_evidence`), distinct from *not run*.
- **Determinism:** pure; identical inputs yield an identical snapshot checksum.

**Known limitation:** an outbound reference is weak evidence of rivalry; a
non-blocklisted partner/vendor link can survive as a low-confidence candidate.
The human-review gate and the `reviewRequired` flag carry that precision burden —
Auxion never auto-asserts or auto-sends.

## Status model (planned)

Replace the UI collapse that flattens five realities ("never ran", "ran but no
evidence", "malformed", "unknown status", "kill switch") into one "Unavailable".
Explicit states, reusing existing enums where possible:
`not_started · running · ready · insufficient_evidence · needs_review ·
approved · failed`. "Ran but no verified evidence" (`insufficient_evidence`) is a
completed outcome, never conflated with "not started".

## Human review gate (planned)

Generated commercial material is **never** auto-visible or auto-sent. Lifecycle
`generated → needs_review → approved → rejected | revision_requested`, carried on
the rich proposal/narrative lifecycle enums and the existing `proposal_versions`
/ `narrative_versions` version chains (`supersedes_id`). The existing
`public.approvals` domain is **not** reused directly (its `subject_type` enum is
bounded to `move|operational_risk|recommendation` and its `client_id` is
`NOT NULL` — prospect scans are internal and often client-less).

## AI cost control

The competitor producer makes **no** model call (pure/deterministic). Any future
commercial LLM step (e.g. an optional narrative polish) MUST reuse the hardened
`#94/#97` execution path — compact bounded output contract, strict JSON,
completion-over-verbosity, safe validation-retry, cost ceiling, timeout, provider
telemetry, no raw-response logging — by generalising its three
`execution_outcomes`-specific seams (prompt-shape map, leak-boundary parser,
executor `outputSchemaId`), never by forking a second uncontrolled path.

## Roadmap

| # | Increment | Status |
|---|---|---|
| 1 | Competitor Discovery producer (pure domain + tests) | **landed** |
| 2 | Commercial workflow engine — separate `CommercialCoordinator`, `commercial_intelligence` queue jobType, idempotent enqueue-on-completion, competitor stage executor persisting a revised `competitor_snapshot` | **landed** |
| 3 | Orchestration trigger (enqueue at scan completion + server-side drive) + coherent commercial status model + competitor UX | next |
| 4 | Human-review gate scaffolding (lifecycle + version persistence) | next |
| 5 | Proposal wiring (AIS-004; pricing → `needs_pricing`) | later PR |
| 6 | Narrative wiring (AIS-001, deterministic-first) | later PR |
| 7 | Prospect → lead/client conversion | later PR (deferred; no auto-convert) |

## Workflow engine (increment 2) — how it attaches

`CommercialCoordinator` (`@brightloop/domain` → `runtime/commercial/`) runs on the
same Postgres queue as the core runtime, under jobType `commercial_intelligence`
with a free-text `stage`. It is a **separate scheduler** — it never calls the core
coordinator's `runOnce`/`enqueueNext` (those are hardwired to `pipeline.nextStage`).

- **Trigger (increment 3):** when the core run completes, the driver calls
  `commercial.enqueueForCompletedRun({runId, scanId, clientId})`. Idempotent on
  `(jobType, runId, stage)` — a refresh/replay of completion converges on one job.
- **Drive:** `commercial.runCommercialOnce(owner)` performs one turn (lease →
  execute → complete → enqueue next stage / emit completion), server-side, mirroring
  the core `runUntilWait` loop. Not browser-driven.
- **Persistence:** the competitor stage revises `competitor_snapshot` only when
  discovery verifies something new; an unchanged unavailable outcome is recorded via
  the `runtime.commercial.competitor_discovered` event, avoiding version churn.
- **Observability:** `runtime.commercial.{enqueued,stage_completed,completed,
  competitor_discovered}` (status + counts only, never entities). No migration
  (event_type is text; queue stage/jobType/payload are flexible).

Non-negotiables throughout: no fabricated competitors/evidence/pricing/ROI, no
auto-send, no auto-convert, no weakened RLS/queue/idempotency, no raised provider
budgets to mask output control, no raw provider-response logging, no
destabilising the working Full Scan.
