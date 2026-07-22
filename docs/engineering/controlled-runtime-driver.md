# Controlled Runtime Driver

Phase C · Sprint C2.1. The server-side execution driver that performs **exactly
one** controlled runtime turn. It is the missing seam between a queued scan and a
real executed stage: it leases one job, executes one stage through the existing
runtime, persists one outcome, enqueues at most one downstream job, and returns.

**It is a coordinator, not an engine.** It contains no stage-transition, retry,
routing, grounding, validation, budget, checkpoint, artifact, or lease logic —
every one of those lives in the Phase-B runtime and the Sprint-C2 provider path,
and the driver only calls into them.

> There is **no worker loop** here. One invocation = one turn. No `while`, no
> recursion, no timer, no polling, no cron, no daemon. A queue consumer (a future
> sprint) is what will call this repeatedly; the driver itself always does one
> unit and stops.

---

## Where it lives

```
@brightloop/providers/src/driver
├── contract.ts   DriverResult / DriverOutcome / DriverEligibility / StageSupport  (safe DTOs)
├── registry.ts   createDefaultStageRegistry — reasoning stage executable, all else blocked
├── driver.ts     ControlledRuntimeDriver — the one-turn orchestrator
└── driver.test.ts + driver.live.test.ts

apps/web/src/lib/runtime-driver.ts                 composition root (server-only)
apps/web/src/app/api/internal/runtime/run-once/route.ts   internal-only entry point
```

The driver is part of `@brightloop/providers` (the only SDK-importing package) so
it can wire the live adapter into the stage registry. It is **server-only**; the
web composition root guards the import with `import "server-only"`.

---

## The one-turn contract

`ControlledRuntimeDriver.runQueueTurn(options)` calls
`RuntimeCoordinator.runOnce`, which does the whole lease → execute → settle →
enqueue turn atomically. The driver adds only:

- a **dispatcher** executor that resolves the per-stage registry (execute or block);
- two additive observability callbacks (`onLease`, `onEnqueue`) so it can name the
  leased job and any downstream job in the result **without changing runOnce's
  return type** (the existing 13C tests stay green);
- a mapping from the runtime's `StageOutcome` (+ captured job + reasoning
  telemetry) to a safe `DriverResult`.

Other operations:

| Method | What it does | Turn cost |
|---|---|---|
| `runQueueTurn(opts)` | Lease one eligible job, execute one stage | ≤1 lease, ≤1 stage, ≤1 enqueue |
| `runRunTurn(runId)` | Advance one specific run's resume stage (no lease) | ≤1 stage |
| `checkEligibility(opts)` | Non-mutating queue-depth peek (dry-run) | 0 (read only) |
| `cancel(runId)` | Cancel a run via the coordinator | 0 stages |

### `DriverResult` (the safe DTO)

A plain object — **no domain entity, no database row, no API key, no raw provider
output, no prompt, no hidden reasoning**. Fields: `executionId`, `correlationId`,
`runId`, `queueJobId`, `stage`, `providerId`, `modelId`, `outcome`, `artifactIds`,
`checkpointId`, `downstreamJobId`, `retryDisposition`, `blockedReason`,
`failureCode`, `latencyMs`, `usage {inputTokens, outputTokens, estimated}`,
`validationStatus`, `startedAt`, `completedAt`, `durationMs`, `warnings`.

`outcome` is one of: `completed`, `advanced`, `blocked`, `retried`, `failed`,
`cancelled`, `no_job_available`, `provider_disabled`, `deadline_exceeded`,
`budget_exhausted`.

---

## Stage-executor registry

`createDefaultStageRegistry` maps the current stage to either an **executable**
implementation or a **stable block**:

- **`provider_execution`** → executable via the controlled reasoning path
  (`runControlledReasoning` against the live adapter). This is the one stage a
  reasoning provider drives today.
- **every other stage** → `{ kind: "blocked", reason }` naming the runtime
  dependency that is not yet wired (crawler/discovery, evidence, graph,
  synthesis, …).

There is **no fabricated placeholder artifact, no fake success, and no hidden
fallthrough**. A stage the driver cannot execute returns a named block:

- An unsupported stage's executor throws `StageBlockedError(reason)`. The
  execution engine turns that into a `blocked` outcome, records **no** stage
  failure, and the coordinator releases the lease **without consuming an
  attempt** — so the queued work stays recoverable once the dependency exists.
- A disabled provider (see gating below) blocks the reasoning stage with the
  stable reason `provider_disabled`.

The block signal reuses the runtime's existing `StageBlockedError` +
`runWork`-catch path (added in the domain package); the driver does not invent a
second blocking mechanism.

---

## Live-provider gating

Live reasoning runs only when **all** of these hold — otherwise the reasoning
stage blocks (`provider_disabled`) and **no SDK client is constructed and no
credit is spent**:

1. `AUXION_LIVE_AI_ENABLED=true`
2. `AUXION_ANTHROPIC_ENABLED=true`
3. a valid `ANTHROPIC_API_KEY`
4. a configured model (`AUXION_ANTHROPIC_MODEL`, default `claude-opus-4-8`)
5. an authorized **internal** actor (route authz, below)
6. an eligible queued job
7. budget available and no cancellation
8. a valid (unexpired) deadline

Items 1–4 are `loadAnthropicConfig().enabled` + `resolveApiKey`; the composition
root passes `adapter = enabled ? registry.get(providerId) : null`, and a `null`
adapter blocks the stage. Items 5–8 are enforced by the route, the coordinator,
and the execution engine respectively — the driver never re-implements them.

---

## Internal entry point

`POST /api/internal/runtime/run-once`

- **`server-only`** — a client-component import is a build error, so the SDK and
  key resolution can never reach the browser bundle.
- **Internal actors only.** The caller must be authenticated and hold
  `transformation.executions.write` (owner via `*`, admin via `transformation.*`,
  team_member explicitly). **Client roles are rejected outright**; an
  unauthenticated caller is `401`, an under-capability caller `403`.
- **No service-role key.** The runtime services carry the caller's own
  RLS-scoped Supabase session, so the database stays the final tenant boundary.
- **No browser-direct provider call.** The provider is only ever reached
  server-side, behind the env gate.
- **Structured response only.** `{ result: DriverResult }` (or
  `{ eligibility }` for `{ "dryRun": true }`). An unexpected throw becomes a
  generic `500` that leaks no message or stack.

Request body (all optional): `{ dryRun?, jobType?, clientId?, leaseSeconds? }`.

---

## `startedAt` stamping (§5)

`RunService.transition` now stamps `startedAt` on the **first** transition into an
active (non-`pending`, non-terminal) status, and only then:

- **idempotent** — a later active transition does not re-stamp (the same `?? now`
  idempotency `markStarted` already used, generalized to any active transition);
- **preserved on resume** — a resumed run already has `startedAt`, so
  `startedAt === null` is false and it is kept;
- **unset for cancelled-before-start** — a run cancelled before it ever ran never
  reaches an active transition (`cancelRun` goes straight through the repository),
  so `startedAt` stays `null`;
- **never overrides** an explicit `patch.startedAt` (e.g. from `markStarted`).

No schema or migration change was required.

---

## What it deliberately does NOT do

No worker/daemon/cron/scheduler; no Redis or external queue; no crawler or
discovery runtime; no OpenAI/Gemini or multi-provider fallback wiring; no public
endpoint; no UI; no PDF/report rendering; no billing/pricing. Those are later
sprints. The driver duplicates none of the runtime's logic — it composes it.

---

## Tests

`driver.test.ts` (deterministic, no network, injected clock + counter ids):

- idle queue → `no_job_available`, mutating nothing; dry-run eligibility leases nothing;
- head discovery stage → `blocked` with a stable reason, **0 attempts consumed**, no fabricated artifact;
- reasoning stage with live AI **off** → `provider_disabled`, job released, no `execution_outcomes` artifact;
- reasoning stage with a **fake transport** → executes once, persists a **safe metadata-only** artifact + checkpoint, enqueues **exactly one** downstream (`advanced`); token usage + validation status surfaced; **raw output never leaks** into any artifact or event;
- **one-turn guarantee** — one call advances one stage; the run does not run to completion; only one job is leased when several are eligible;
- fatal provider failure → terminal `failed`/`retried`, nothing persisted;
- cancellation; `startedAt` stamped once / preserved / unset; registry resolution (reasoning executable, all else blocked).

`driver.live.test.ts` — **gated** on `AUXION_RUN_LIVE_PROVIDER_TESTS=true` + a
real key + enabled config; excluded from the default `test` script (only
`test:live` includes `*.live.test.ts`), so **CI never spends credit**. It drives
one real reasoning turn end to end with a tiny, strictly-capped request and
asserts no raw content leaked, logging an approximate cost with no secret.
