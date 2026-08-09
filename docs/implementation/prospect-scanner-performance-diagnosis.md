# Prospect Scanner — one-click execution performance diagnosis

Diagnosis of the slow production scan (`polishedprocleaners.net`: ~5m13s, ~77
"turns", stuck at stage 9/13 `provider_execution`, repeatedly "Retrying in 2
seconds…"). **Diagnosis first — no blind optimization.** Fixes below are limited
to the ones proven from the code; the dominant latency is external provider time
and is *not* optimized away (retries/budget/queue semantics are untouched).

## 1. The measured bottleneck

The pipeline splits into two cost classes:

- **Deterministic stages (1–8, 10–13)** — CPU + a little DB I/O. They **chain
  inside one bounded auto-run request**: each `advanced` outcome enqueues the next
  stage with `available_at = now`, and the server loop immediately leases it. So
  the whole deterministic run advances in a couple of requests (≤12 turns / ≤8s
  each, then a 250 ms client hop). These are **not** the bottleneck. The one real
  external cost here is `discovery_completion` (the crawler fetching the site) —
  required network latency, typically a few seconds for a 5–8 page site.
- **`provider_execution` (stage 9)** — the reasoning stage. Its timing is set by
  the **queue + reasoning retry policy** and **live provider latency**:
  - queue `advance_stage` jobs: `maxAttempts = 5`, exponential backoff
    `min(1000·2^attempt, 300000)` ⇒ **1s, 2s, 4s, 8s, 16s** between queue attempts;
  - each queue attempt runs the reasoning orchestrator, whose **internal**
    `maxAttempts = 3` ⇒ up to 3 provider calls per queue attempt;
  - so a **failing** reasoning stage makes up to **5 × 3 = 15 provider calls**,
    each ~10–30 s (Opus, hydrated evidence context, ~2000 output tokens).

**15 × ~20 s ≈ 300 s ≈ the observed 5 minutes.** The bottleneck is therefore
`provider_execution` repeatedly executing the reasoning (internal retries × queue
retries) — i.e. **the reasoning kept failing and retrying**, spending real paid
provider latency. That is *required* latency for the retry policy as configured;
making it faster means the reasoning succeeding sooner (a correctness concern,
out of scope here), **not** removing retries or shrinking the budget.

## 2. What "77 turns" means (metric bug)

`turnsExecuted` in PR #95 counts **every `driver.runQueueTurn` call**, and the UI
sums it across polls. A `runQueueTurn` returns `no_job_available` when it leases
nothing — which happens **during every backoff window**. So the "77" is a mix,
dominated by **empty polls**, not stage executions:

| category | count (approx) |
|---|---|
| A. actual stage executions | ~13 (the pipeline) + reasoning re-tries |
| B. queue lease attempts | = turns (each turn is one lease) |
| C. HTTP polling requests | ≈ turns / turns-per-request |
| **D. leases that returned no eligible job (backoff)** | **the majority** |

→ **the "77 turns" number is misleading**: it labels empty backoff polls as
execution "turns". It must be split into `stageExecutions` vs `polls`
(no-op checks) — see §5/§7.

## 3. Stage timing model

| # | stage | queue wait | execution | external I/O | notes |
|---|---|---|---|---|---|
| 1 | discovery_planning | ~0 | ms | — | chains |
| 2 | discovery_completion | ~0 | ms | **crawler fetch (network)** | required |
| 3 | evidence_normalization | ~0 | ms | — | chains |
| 4 | evidence_validation | ~0 | ms | — | chains |
| 5 | graph_assembly | ~0 | ms | — | chains |
| 6 | graph_snapshot | ~0 | ms | — | chains |
| 7 | reasoning_job_creation | ~0 | ms + 1 DB write (ledger) | — | chains |
| 8 | provider_routing | ~0 | ms | — | chains |
| 9 | **provider_execution** | **backoff 1–16 s ×N** | **provider call ~10–30 s ×(3×N)** | **provider** | **dominant** |
| 10 | grounding_validation | ~0 | ms | — | chains |
| 11 | finding_synthesis | ~0 | ms | — | chains |
| 12 | recommendation_candidates | ~0 | ms | — | chains |
| 13 | report_assembly | ~0 | ms | — | chains |

**The exact production split for a given run is derivable from existing runtime
data** — `intelligence_run_stages.created_at` deltas, the append-only
`runtime_events` (stage start/complete/queue events), and `provider_attempts`
(`latency_ms`, `attempt`, tokens). No new persistence is required to measure it.

## 4. Required vs avoidable latency

| latency | class | rationale |
|---|---|---|
| provider call time (~10–30 s each) | **REQUIRED** | external model latency |
| reasoning internal retries (×3) | **REQUIRED** | anti-hallucination retry policy — do not weaken |
| queue exponential backoff (1–16 s) | **REQUIRED** | queue safety; do not remove |
| crawler fetch | **REQUIRED** | real network |
| **fixed 2 s poll during a real backoff** | **AVOIDABLE** | the browser should wait the actual `available_at`, once — not poll every 2 s |
| **empty-poll turns counted as executions** | **AVOIDABLE** | misleading metric |
| **"MODE · MANUAL, ONE STAGE PER TURN" during Full Scan** | **AVOIDABLE** | stale copy |

Crucially, **immediately-eligible stages already do NOT incur a 2 s wait** — they
chain within the server loop (250 ms client hop only when the bounded window
closes mid-progress). The 2 s appears **only** on `no_job_available`, i.e. while a
job is backing off — and there the fixed default is wrong: it should be the real
backoff.

## 5. The "Retrying in 2 seconds" loop (root cause of the avoidable waste)

`buildAutoRunResponse` returns the **exact** backoff only when the last turn was
`retried` (it has a `queueJobId`, so the route reads that job's `available_at`).
When the browser polls again *during* the backoff window, the lease finds nothing
→ `no_job_available` (no `queueJobId`) → the response falls back to the **fixed
`AUTO_RUN_DEFAULT_WAIT_MS = 2000`**. So a 16 s backoff becomes ~8 empty 2 s polls,
each an inflated "turn" and each a wasted Vercel request. **Fix:** on
`no_job_available` with a non-terminal run, return the queue's real next
`available_at` (a new non-mutating `QueueService.nextAvailableAt(clientId)`), so
the browser waits once for the true backoff.

## 6. Realistic target

For a normal 5–8 page site with the reasoning succeeding on the **first** attempt:

- deterministic stages: **near-immediate** (a few hundred ms total once inputs exist);
- crawler: **~2–10 s** (network);
- one reasoning call: **~10–30 s** (provider latency only);
- ⇒ **total ≈ 20–45 s** end to end.

**≈ 1–2 minutes is realistic only when the reasoning needs one retry.** The
observed 5 minutes is the reasoning failing ~5× (up to 15 provider calls) — an
outlier driven by reasoning quality, not orchestration. Orchestration overhead,
after the fixes below, is a handful of requests and near-zero avoidable waiting.

## 7. Changes made (orchestration + observability only; safety preserved)

1. **Real backoff on idle** — `QueueService.nextAvailableAt(clientId)` (non-mutating
   min `available_at` of queued jobs); the route returns it as `retryAfterMs` on
   `no_job_available`, so the browser waits the true backoff once instead of
   polling every 2 s.
2. **Honest metrics** — the loop tracks `stageExecutions` (real advances/failures)
   vs `polls` (empty `no_job_available` checks); the response and UI report
   `Stages X/13 · N executions · M waits` instead of an ambiguous "turns".
3. **UI copy** — Full Scan reads **AUTOMATIC · CHECKPOINTED EXECUTION**; the
   "manual, one stage per turn" wording stays inside Advanced → Run One Stage.

**Not changed (safety):** queue lease/`SKIP LOCKED`, exponential backoff, retry
policy, `maxAttempts` (queue 5 / reasoning 3), provider budget/timeout, dead-letter,
checkpoints, RLS, authorization, idempotency, cancellation, resume, append-only
events, one provider execution per legitimate attempt. No token-budget change.

## 8. Before / after orchestration metrics (offline, fake driver)

Measured with the auto-run unit harness (a scripted driver that models a stage
backing off), NOT a live provider — provider/network speed is unchanged.

| metric | before | after |
|---|---|---|
| empty 2 s polls during a 16 s backoff | ~8 | **1** (waits the real 16 s) |
| "turns" shown for a clean 13-stage run | 13 + empties | **13 executions, 0 waits** |
| poll wait during genuine backoff | fixed 2 s | **actual `available_at`** |

## Remaining external latency

Provider call time and the reasoning/queue retry policy dominate and are
unchanged. If a scan is still slow after these fixes, the cause is the reasoning
**failing and retrying** — inspect `provider_attempts` (`failure_kind`,
`stop_reason`, `latency_ms`) and the structured `runtime.stage.failed` code
(`reasoning_output_truncated`, etc., from PR #94). That is a reasoning-quality
question, addressed separately from orchestration.

## Note on serverless duration

A single `provider_execution` turn can run up to 3 internal provider calls; ensure
the auto-run route's function `maxDuration` comfortably exceeds one reasoning turn
(3 × provider timeout) so the function is never killed mid-reasoning (which would
waste a lease and re-execute). Verify against the deployed config; not changed here.
