# One-Click Execution — "Run Full Scan"

The Prospect Scanner exposes a single primary action — **Run Full Scan** — that
drives the whole 13-stage pipeline to completion automatically, with live progress.
The manual **Run One Stage** workflow remains available under *Advanced* for
debugging.

This document explains the architecture, polling strategy, server execution window,
retry/resume/cancel behaviour, and how to extend it.

## Non-goals (what this is NOT)

It is **not** a new runtime. It creates no worker, cron, daemon, or second engine,
and it never bypasses the queue or calls a stage executor directly. Every unit of
work is exactly the existing controlled `run-once` turn:

```
lease ≤1 job → execute ≤1 stage → persist ≤1 outcome → enqueue ≤1 downstream → return
```

All of the runtime's guarantees are therefore preserved unchanged: the atomic
queue lease (`SKIP LOCKED`), retry policy, backoff, dead-letter, checkpoints,
artifact immutability, per-job budgeting, idempotency, and RLS.

## Architecture

```
Browser (FullScanRunner)                Server                        Runtime
──────────────────────────    ───────────────────────────    ─────────────────────
click "Run Full Scan"
   │ POST /run-until-wait ───▶ authenticate + authorize
   │                          load run (RLS) → clientId
   │                          ┌── runUntilWait (bounded) ──┐
   │                          │  loop:                     │
   │                          │   driver.runQueueTurn() ───┼──▶ coordinator.runOnce
   │                          │   classify(outcome)        │      (lease/exec/settle/enqueue)
   │                          │   continue? → next turn    │
   │                          │   else → stop              │
   │                          └────────────────────────────┘
   │◀── AutoRunResponse ────── build response (+ backoff from queue.available_at)
   │   { nextAction, retryAfterMs, progress… }
   │
   ├─ nextAction=continue → wait retryAfterMs → POST again
   ├─ nextAction=blocked  → stop, surface reason
   └─ nextAction=done     → stop, refresh (report is ready)
```

- **Server loop** — `apps/web/src/lib/auto-run.ts` (`runUntilWait`): a *bounded*
  repetition of `driver.runQueueTurn`. It continues while the last turn `advanced`
  (a downstream stage was enqueued and is ready now) and stops on the first
  wait/terminal/blocked outcome, or when the bounded window is spent.
- **Endpoint** — `POST /api/internal/runtime/run-until-wait`: same auth as
  `run-once` (internal actor + `transformation.executions.write`; client roles
  denied; caller's own RLS session, no service-role bypass). Returns a safe
  `AutoRunResponse` DTO — no domain entity, DB row, key, prompt, or raw output.
- **Client** — `FullScanRunner.tsx`: a single-in-flight polling controller.

## Outcome → decision → next action

| driver outcome | decision | client nextAction |
|---|---|---|
| `advanced` | continue | continue (immediately) |
| `retried`, `no_job_available` | wait | continue (after backoff) |
| `completed`, `failed`, `cancelled`, `deadline_exceeded`, `budget_exhausted` | terminal | done |
| `blocked`, `provider_disabled` | blocked | blocked (stop + surface) |

A run whose lifecycle is already terminal is always reported `done`, regardless of
the last turn — so the browser never polls a finished run.

## Server execution window

Each request runs at most `AUTO_RUN_DEFAULT_MAX_TURNS` (12, ceiling 25) turns and
at most `AUTO_RUN_DEFAULT_MAX_MS` (8s, ceiling 9s) — comfortably under the
serverless timeout. When the window closes while the pipeline is still advancing,
the response is `nextAction: continue` with a short `retryAfterMs`, and the browser
simply calls again. Progress is durable in the queue between calls.

## Polling strategy (client)

- **Exactly one request in flight** — an in-flight ref plus an `AbortController`.
  A duplicate poll is also harmless server-side: the queue lease serializes work,
  so two callers can never double-execute a stage.
- **Backoff** — the browser waits `retryAfterMs` (the exact `available_at` of a
  scheduled retry, or a default) before the next call. It never hammers the runtime.
  A retry shows *"Retrying in N seconds…"* and continues automatically.
- **Teardown** — on unmount/navigation the loop is stopped and the in-flight
  request aborted.

## Resume

The run lives server-side in the queue, so it survives a browser refresh or close.
On mount, if the scan's lifecycle is `running`, `FullScanRunner` **resumes driving**
automatically — it never restarts from Discovery; it just continues the run's next
queued job.

## Cancellation

**Cancel scan** tears down the client loop (stops polling, aborts the in-flight
request) and submits the existing cancel server action (`cancelScan` →
`coordinator.cancelRun`). Cancellation preserves artifacts, runtime events, and
checkpoints — it only stops future work.

## Observability

All existing runtime events are unchanged. Three optional session markers are
emitted best-effort (never duplicating stage events): `runtime.autorun.started`,
`runtime.autorun.waiting`, `runtime.autorun.completed`. `runtime_events.event_type`
is a text column, so these needed no migration.

## Provider safety

Nothing here repeats a provider call outside queue policy, bypasses `maxAttempts`
or the budget, creates duplicate reasoning jobs, or ignores dead-letter. All of
that is owned by the coordinator/queue, which the loop merely repeats.

## Future extensibility

- Server-Sent Events / websockets could replace polling for lower-latency progress.
- A server-side driver (background worker) could drive runs without a browser,
  reusing `runUntilWait` behind a durable scheduler.
- The `retryAfterMs` could incorporate a jittered global cap under load.
