# Business Intelligence Engine — Architecture (PDF 27)

> **Sprint 1 = SKELETON.** Contracts, ports, state machines, and pure domain
> logic only. No provider SDK, LLM call, crawler, queue backend, proposal, or
> persistence. Canonical source: `docs/design/source/27-Business-Scan-Engine.pdf`.
> Follows PDFs 00–26 (PDF 26 governs scan behaviour); contradicts none.

## Eight composable layers (`@brightloop/domain/scan-engine/*`)

| Layer | Module | Responsibility |
|---|---|---|
| L1 Discovery | `discovery/` | URL → bounded crawlable surface (SSRF-guarded in the adapter) |
| L2 Crawler | `crawler/` | Fetch under budget/rate limits → raw captures (no interpretation) |
| L3 Evidence | `evidence/` | Classify (Observed/Estimated/Inferred/Unavailable) + timestamp + reliability |
| L4 Business Graph | `graph/` | Normalize evidence; compute the Business Health Index |
| L5 Reasoning | `reasoning/` | 6-stage strategy + the confidence model |
| L6 Recommendation | `recommendation/` | Findings → tiered, evidence-linked Moves |
| L7 Proposal | `proposal/` | Approved moves → 6-part proposal |
| L8 Monitoring | `monitoring/` | Re-scan cadence, change detection, trend |

Plus `orchestration/` (13-stage pipeline state machine + events + background
policy) and `provider-router.ts` (vendor-agnostic AI selection).

## Canonical constants (in `@brightloop/schema/engine`)

- **13-stage pipeline** (`engineStageSchema` / `ENGINE_PIPELINE`), each stage an
  artifact or process, mapped to one of the 8 layers.
- **19 evidence sources** with fixed **default states** (`EVIDENCE_SOURCE_DEFAULT_STATE`);
  4 states shared with the PDF-26 surface model.
- **6 reasoning stages**, **6 confidence factors**, **10 Index dimensions** (weights
  sum to 100), **4 recommendation tiers** with **7 mandatory move attributes**,
  **6 proposal parts**, **6 monitoring channels**, **8 competitor signals**.
- Reference constants: 6 verbs, 7 laws, 8 principles, background/cost/security
  vocabularies.

## Pure, deterministic logic (100% tested)

- `computeConfidence` — geometric mean; any factor near zero caps the composite
  (never raises confidence to fill a gap).
- `computeIndex` — weighted Index over the 10 dimensions, normalized by covered
  weight, reports `coverage`.
- `sortMoves` / `groupByTier` — Critical Risks outrank every optimization; then
  impact desc, difficulty asc, id — a total, stable order.
- `nextEngineStage` / `canTransition` (13-stage SM); `nextReasoningStage` (6-stage SM).
- `defaultStateForSource` / `classifySignal`; `backoffDelayMs` / `shouldRetry`;
  `orderProviders` (deterministic fallback set); `classifyChange` (dead-banded).

## Invariants honoured (PDF 27 §02 laws / §18 principles)

Evidence before reasoning · cite everything (a Move must carry ≥1 evidence id) ·
confidence is mandatory and computed · four-state honesty travels with every
signal · no vendor lock-in (AI behind one interface, no vendor named in domain) ·
every layer independently testable with bounded input/output.

## Deferred (later sprints)

Crawler/discovery adapters, LLM provider adapters, competitor/benchmark providers,
proposal rendering, background queue backend + workers, monitoring scheduler,
persistence (migrations), cost metering. All are adapter/infra concerns behind the
ports defined here.
