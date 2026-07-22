# Runtime Sequences — Phase B

How the AUXION runtime actually executes, as sequence diagrams.

Scope: Sprint 13A (persistence schema, RLS), 13B (repository ports, typed adapters, atomic leasing) and 13C (services, execution engine, coordinator, read models).

**Nothing here schedules itself.** There is no daemon, no cron, no hosted queue. Postgres is the queue; a caller decides when a worker turn happens.

---

## 1 · Layers

Each layer answers one question and defers the rest.

```mermaid
flowchart TB
  A["<b>Phase A · pure engine</b><br/>stage graph · transitions · retry policy · budget · checksums"]
  C["<b>RuntimeCoordinator</b><br/>what runs next, and how it queues"]
  E["<b>RuntimeExecutionEngine</b><br/>how one stage executes"]
  S["<b>Services</b> ×12<br/>one aggregate each · emit events"]
  R["<b>Repositories</b> ×13<br/>idempotency · atomic leasing · error mapping"]
  P["<b>Postgres</b><br/>RLS · unique indexes · append-only log"]

  C -->|"delegates execution"| E
  C -->|"lease / complete / fail"| S
  E -->|"gate · artifact · checkpoint"| S
  E -.->|"consults, never restates"| A
  C -.->|"consults, never restates"| A
  S --> R --> P
```

Two rules hold this together:

1. **Phase A decides, Phase B persists.** Stage dependencies, legal transitions, retry disposition and checksums are Phase A's. The runtime consults them; it never restates them. Re-deriving any rule would fork the truth.
2. **The engine never touches the queue.** Stage execution is testable and reusable without a queue in the picture — a backfill or manual re-run drives the engine directly.

---

## 2 · Starting a run

Both writes are keyed on natural identity, so calling this twice converges on the same two rows rather than forking a second run.

```mermaid
sequenceDiagram
  actor Caller
  participant Co as RuntimeCoordinator
  participant RS as RunService
  participant QS as QueueService
  participant Repo as Repositories
  participant DB as Postgres

  Caller->>Co: initializeRun({clientId, scanId})
  Co->>RS: createRun(...)
  Note over RS: idempotencyKey = "run:{scanId}"
  RS->>Repo: createRun(record)
  Repo->>DB: INSERT intelligence_runs
  alt first time
    DB-->>Repo: inserted
    Repo-->>RS: ok(created)
    RS->>Repo: appendRuntimeEvent(runtime.run.created)
  else duplicate start
    DB-->>Repo: 23505 unique_violation
    Repo->>DB: re-read by idempotency key
    Note over Repo: compare canonical fingerprint
    Repo-->>RS: ok(replayed) — same run, no event
  end
  RS-->>Co: run

  Co->>QS: enqueue(advance_stage, stage 1)
  Note over QS: idempotencyKey = "q:{jobType}:{runId}:{stage}"
  QS->>Repo: enqueueJob(record)
  Repo->>DB: INSERT job_queue
  Repo-->>QS: created | replayed
  QS-->>Co: job
  Co-->>Caller: {run, job}
```

Same key + **different** payload returns `conflict`, never a silent overwrite. That refusal is what makes replay safe.

---

## 3 · One worker turn

The unit a queue consumer repeats. It performs exactly one turn and returns.

```mermaid
sequenceDiagram
  actor Worker
  participant Co as RuntimeCoordinator
  participant QS as QueueService
  participant Eng as RuntimeExecutionEngine
  participant DB as Postgres

  Worker->>Co: runOnce(owner, executor)
  Co->>QS: lease({owner, leaseSeconds})
  QS->>DB: SELECT bl_lease_next_job(...)
  Note over DB: UPDATE ... WHERE id = (<br/>SELECT ... ORDER BY priority,<br/>available_at, created_at<br/>FOR UPDATE SKIP LOCKED LIMIT 1)<br/><b>one statement — two workers cannot collide</b>

  alt queue idle
    DB-->>QS: 0 rows
    QS-->>Co: no_job_available
    Co-->>Worker: null (normal, not an error)
  else job leased
    DB-->>QS: job (attempt+1, lease_expires_at set)
    QS-->>Co: job
    Co->>Eng: execute(runId, stage, executor, attempt)
    Eng-->>Co: StageOutcome
    Co->>Co: settleJob(outcome)

    alt completed / skipped
      Co->>QS: complete(job, owner)
      Co->>Co: enqueueNext(stage+1) — or completeRun at the end
    else blocked
      Co->>QS: release(job, owner)
      Note over QS: does NOT consume an attempt —<br/>unmet dependencies are not a failed try
    else failed
      Co->>QS: fail(job, owner, error)
      Note over QS: retry at deterministic backoff,<br/>or dead-letter once attempts run out
    else cancelled
      Co->>QS: cancel(job)
    else deadline exceeded
      Co->>QS: fail(..., {fatal: true})
    end
    Co-->>Worker: outcome
  end
```

---

## 4 · Executing one stage

Six ordered steps. A crash between any two is safe: every write is keyed on natural identity, so the replay returns the original record instead of creating a second one.

```mermaid
sequenceDiagram
  participant Eng as RuntimeExecutionEngine
  participant RS as RunService
  participant PS as PipelineService
  participant W as Caller's work
  participant AS as ArtifactService
  participant CS as CheckpointService

  Note over Eng: 1 · preflight — cheapest refusals first
  Eng->>RS: getRun(runId)
  alt cancelled or past deadline
    Eng->>RS: failRun / emit deadline event
    Eng-->>Eng: stop — work never runs
  end

  Note over Eng: 2 · recovery
  Eng->>CS: latestValid(runId)
  alt checkpoint proves this stage done
    Eng->>PS: skipStage(...)
    Eng-->>Eng: skipped — <b>work never runs twice</b>
  end

  Note over Eng: 3 · gate (Phase A decides)
  Eng->>PS: beginStage(from, to, attempt)
  PS->>PS: canAdvanceStage + stageDependenciesMet
  alt dependencies unmet
    PS-->>Eng: blocked + which artifact kinds are missing
    Eng-->>Eng: blocked (recoverable, diagnosable)
  else illegal order
    PS-->>Eng: rejected outright
  end
  Eng->>RS: transition(statusForStage(stage))

  Note over Eng: 4 · the caller's work
  Eng->>W: execute(stage, run)
  alt throws
    W-->>Eng: error
    Eng->>PS: failStage(attempt, error)
  else produces
    W-->>Eng: {envelope, kind, sourceArtifactIds}
  end

  Note over Eng: 5 · artifact BEFORE checkpoint
  Eng->>AS: persist(envelope, kind, lineage)
  Note over AS: checksum via Phase A artifactChecksum<br/>same version + different content → <b>conflict</b>
  AS-->>Eng: artifactId

  Note over Eng: 6 · checkpoint = durably complete
  Eng->>PS: completeStage(...)
  Eng->>CS: save({stage, attempt, artifactIds, nextStage})
```

Step 5 precedes step 6 deliberately: **a checkpoint must never reference an artifact that does not exist.**

---

## 5 · Crash recovery

Recovery is one decision — the last valid checkpoint's `nextStage` — and everything else follows from it.

```mermaid
sequenceDiagram
  participant W1 as Worker A (dies)
  participant DB as Postgres
  participant W2 as Worker B
  participant Eng as RuntimeExecutionEngine

  W1->>DB: lease job (lease_expires_at = now + N)
  W1->>DB: complete stages 1–3, checkpoint each
  Note over W1: ✗ process dies mid-stage-4

  Note over DB: no sweeper runs.<br/>The lease simply stops matching<br/>the owner-scoped UPDATE.

  W2->>DB: lease next eligible job
  DB-->>W2: the same job — its lease has lapsed
  W2->>Eng: execute(runId, stage, ...)
  Eng->>DB: getLatestValidCheckpoint(runId)
  DB-->>Eng: checkpoint(stage 3, nextStage = 4)

  alt replaying stage 1–3
    Eng-->>W2: skipped — work function never invoked
  else stage 4
    Eng->>Eng: full execution path
  end

  Note over W1,DB: if Worker A revives, its writes<br/>replay (same keys) and its lease<br/>operations return lease_lost
```

Superseding a checkpoint marks it `invalidated` with a reason and **retains the row**. History is never destroyed, so a later investigation can see what the run believed at the time.

---

## 6 · Retry, fallback and dead-letter

The disposition is Phase A's `decideRetry`; the runtime only makes it durable.

```mermaid
flowchart TD
  F["stage or provider fails"] --> K{"failure kind<br/>(Phase A)"}
  K -->|"fatal · budget · cancelled"| STOP["stop"]
  K -->|"validation"| SAME["retry_same<br/>tighten the prompt,<br/>keep the provider"]
  K -->|"retryable · timeout"| FB{"fallback<br/>available?"}
  FB -->|yes| NEXT["retry_fallback<br/>next provider in chain"]
  FB -->|no| SAME

  SAME --> B{"attempts left?"}
  NEXT --> B
  B -->|yes| RE["queue: status→queued<br/>available_at = now + backoff<br/><i>1s, 2s, 4s … capped at 300s</i>"]
  B -->|no| DL["dead_letter"]
  STOP --> DL

  RE --> EV1["event: runtime.queue.retry_scheduled"]
  DL --> EV2["event: runtime.queue.dead_lettered"]
```

Backoff is deterministic — **no jitter** — so a replay of the same failure sequence reproduces the same schedule.

---

## 7 · Provider attempts — what is and isn't stored

```mermaid
sequenceDiagram
  participant RSvc as ReasoningService
  participant PA as ProviderAttemptService
  participant DB as Postgres

  RSvc->>PA: record({providerId, attempt, status,<br/>latencyMs, cost, tokens, rawResponseRef})
  Note over PA: idempotencyKey = "pa:{jobId}:{attempt}"<br/>a re-report replays — the cost ledger never inflates
  PA->>DB: INSERT provider_attempts
  PA->>DB: emit runtime.provider.attempted
  Note over DB: event payload = {providerId, attempt, status}<br/><b>and nothing else</b>
```

`provider_attempts` has **no column for completion text**. Raw model output and chain-of-thought are structurally unstorable, not merely discouraged — `rawResponseRef` is a pointer to storage held elsewhere. `providerId` is opaque; no domain code branches on a vendor name.

---

## 8 · Append-only event log

```mermaid
sequenceDiagram
  participant Svc as any service
  participant ES as EventService
  participant Repo as RuntimeEventRepository
  participant DB as Postgres

  Svc->>ES: emit({eventType, aggregate, payload})
  ES->>Repo: appendRuntimeEvent(...)
  Repo->>DB: read max(sequence) for aggregate
  Repo->>DB: INSERT sequence + 1
  alt concurrent append
    DB-->>Repo: 23505 on (aggregateType, aggregateId, sequence)
    Repo-->>ES: serialization_conflict
    Note over ES: the log is never silently reordered
  else
    DB-->>Repo: inserted
  end
```

Immutability is enforced three times over, deliberately:

| Layer | Mechanism |
|---|---|
| Service | `EventService` exposes no update or delete |
| Port | `RuntimeEventRepository` declares no update or delete |
| Database | UPDATE/DELETE revoked · no policy · immutability trigger |

The database layer exists because grants alone were not enough: a 13A defect found in CI showed UPDATE matching *zero rows* (so the trigger never fired) rather than raising. Explicit `revoke` plus the trigger closed it.

---

## 9 · Read models

```mermaid
flowchart LR
  DB[("runtime tables")] --> Repo["repositories"] --> Rows["typed rows"]
  Rows --> V["pure projection functions"]
  V --> D1["Dashboard"]
  V --> D2["Active Runs"]
  V --> D3["Run Timeline"]
  V --> D4["Stage Status"]
  V --> D5["Queue Status"]
  V --> D6["Artifact / Evidence Summary"]
  V --> D7["Finding / Recommendation Summary"]
  V --> D8["Competitor / Proposal / Narrative Summary"]
  V --> D9["Provider Attempt Summary"]
  V --> D10["Event Timeline"]
```

Projections only — rows in, view out. **No scoring, ranking, confidence maths or severity logic**: all of that was decided in Phase A and is already baked into the envelopes being read back. A read model that re-derived any of it would create a second, silently divergent source of truth.

The Event Timeline sorts by **sequence, not timestamp** — two events can share a millisecond, never a sequence.

---

## 10 · Guarantees and where they live

| Guarantee | Enforced by |
|---|---|
| No duplicate execution | Idempotency keys derived from natural identity + checkpoint skip |
| Idempotent retries | Replay-vs-conflict on every write path |
| Deterministic replay | Phase A `artifactChecksum` (FNV-1a over canonical JSON); no jitter, no clock in decisions |
| Checkpoint recovery | Last valid checkpoint's `nextStage`; invalidated rows retained |
| Append-only artifacts | No update method on port or service; conflict on changed content at same version |
| Append-only events | Service + port + revoked grants + trigger |
| Immutable versions | `supersedesId` chain; a new version never rewrites its predecessor |
| Legal transitions only | Phase A `canRunTransition` / `canAdvanceStage`; illegal is rejected, not coerced |
| Preserved lineage | `sourceArtifactIds` and `supersedesId` on the rows themselves |
| One worker per job | `FOR UPDATE SKIP LOCKED` in a single statement |
| Lease ownership | Owner re-asserted *inside* every mutating statement |
| Tenant isolation | RLS on internal-only tables; adapters never use the service role |

---

## Related

- `packages/schema/src/runtime.ts` — runtime contracts
- `packages/domain/src/runtime/repository.ts` — the 13 ports
- `packages/domain/src/runtime/services/` — services, execution engine, coordinator, read models
- `packages/data/src/runtime/adapter.ts` — typed Supabase adapter
- `supabase/migrations/20260720000100_runtime_persistence.sql` — tables, RLS, immutability trigger
- `supabase/migrations/20260721000100_runtime_lease_rpc.sql` — `bl_lease_next_job`
