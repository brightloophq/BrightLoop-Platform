# Live Provider Adapter — Anthropic (Claude)

Phase C · Sprint C2. The first production `ReasoningProviderAdapter`: it lets one
reasoning job execute through the existing routing → validation → accounting →
persistence stack against the real Anthropic API — while the engine, runtime, and
application layers stay entirely vendor-agnostic.

**It is transport and normalization only. It contains no business logic.**

---

## Architecture

```
domain (Node-free)                 @brightloop/providers (infra; imports the SDK)
────────────────────               ──────────────────────────────────────────────
ReasoningProviderAdapter  ◀── implements ── AnthropicReasoningProviderAdapter
executeReasoningJob (Sprint 7)                    │
   route → execute → validate                     ├── prompt.ts      (request translation)
   → account → provenance                         ├── normalize.ts   (response → RawProviderOutput)
                                                   ├── errors.ts      (classification → ReasoningFailureKind)
                                                   ├── transport.ts   (the ONLY file that imports @anthropic-ai/sdk)
                                                   ├── config.ts      (typed config + env + kill switches)
                                                   └── registration.ts(env-safe factory + registry)
```

The **domain** package stays Node-free and never imports a vendor SDK. All SDK
types are contained inside `transport.ts`; nothing above the `AnthropicTransport`
interface sees an SDK object. The adapter's provider id is **opaque**
(`anthropic-primary` by default), so domain code never learns the vendor.

Package: `@brightloop/providers`. Server-only — never import it from a client
bundle (the web composition root, `apps/web/src/lib/providers.ts`, is guarded
with `import "server-only"`).

---

## Configuration

`loadAnthropicConfig(env)` resolves a typed, **non-secret** `AnthropicConfig`. It
never reads the API key (that is resolved separately and handed straight to the
SDK), so a config value can never carry a secret into a log line or a snapshot.

| Env var | Meaning | Default |
|---|---|---|
| `AUXION_LIVE_AI_ENABLED` | Global live-AI kill switch | `false` |
| `AUXION_ANTHROPIC_ENABLED` | Provider kill switch | `false` |
| `ANTHROPIC_API_KEY` | The API key (never logged) | — |
| `AUXION_ANTHROPIC_MODEL` | Model id | `claude-opus-4-8` |
| `AUXION_ANTHROPIC_BASE_URL` | API base URL | `https://api.anthropic.com` |
| `AUXION_ANTHROPIC_TIMEOUT_MS` | Per-call timeout | `60000` |
| `AUXION_ANTHROPIC_MAX_OUTPUT_TOKENS` | Output cap | `4096` |
| `AUXION_ANTHROPIC_REGION` | Region tag (metadata) | `null` |
| `AUXION_ANTHROPIC_MAX_INPUT_TOKENS` | Input cap | `180000` |
| `AUXION_ANTHROPIC_HEALTHCHECK_TIMEOUT_MS` | Health probe timeout | `5000` |
| `AUXION_ANTHROPIC_CONCURRENCY` | Request concurrency | `2` |
| `AUXION_ANTHROPIC_INPUT_PER_MTOKENS` / `_OUTPUT_PER_MTOKENS` | Cost metadata | `5` / `25` |

Rules (enforced and tested):

- **Nothing enables live AI by default** — both switches default off.
- **`enabled` requires BOTH switches** — either one, off, disables the provider.
- A **missing key while disabled is fine** — startup must not crash.
- A **missing key while enabled fails clearly** (`AnthropicConfigError`, code
  `missing_api_key`) with **no secret in the message**.
- **No `NEXT_PUBLIC_` variable is read** — app/server environment only, so the key
  can never reach a client bundle.

---

## Kill switches

Two switches, checked at two layers:

- **Registration** (`createAnthropicAdapter`): a disabled provider returns `null`,
  so it is never added to the registry and routing never sees it. **No SDK client
  is constructed while disabled.**
- **Execution** (defence in depth): if a disabled adapter is somehow asked to
  execute, it fails fast with a stable reason (`ProviderExecutionError("fatal",
  "anthropic provider disabled")`) and **makes no outbound request**.

To disable in any environment, set either `AUXION_LIVE_AI_ENABLED=false` or
`AUXION_ANTHROPIC_ENABLED=false`. This is also the **rollback / disable
procedure** — flip a flag, redeploy config; no code change, no data migration.

---

## Provider registration

`buildProviderRegistry(options, extra)` returns an opaque-id → adapter map. It
includes the Anthropic adapter only when enabled, and merges any `extra` adapters
(e.g. the in-memory test double) so they coexist. Tests inject their own transport
(`createAnthropicAdapter({ config, transport })`) or their own full adapter set.

The domain never imports the registration module — it depends only on the adapter
interface. Concrete wiring lives at the app/server composition root
(`apps/web/src/lib/providers.ts`).

---

## Request / response flow

1. **Translate** (`prompt.ts`): the canonical `ExecutionRequest` becomes an
   Anthropic system + user message. The prompt requires a **single JSON object**,
   the exact output-contract id, **explicit evidence citations**, **explicit
   limitations**, and forbids **unsupported claims, fabricated metrics,
   fabricated competitors, and unavailable-source claims**. It requests **no
   hidden chain-of-thought, scratchpad, or internal reasoning**.
2. **Send** (`transport.ts`): the request goes through the official SDK
   (`messages.create(...).withResponse()`), with an `AbortSignal` and a
   per-call `timeout`. The raw SDK response never leaves this file.
3. **Normalize** (`normalize.ts`): parse the JSON body into an untrusted object,
   map `stop_reason` → `FinishReason`, pass usage through, and record a **safe
   reference** (`anthropic:<providerId>:<requestId>`) — never the raw content.
4. **Validate**: the adapter returns `RawProviderOutput`; the **Sprint-7
   orchestrator** runs schema parsing, grounding guards, citation validation,
   confidence ceilings, and fabricated-claim checks. The adapter implements **no
   second validation framework**.

Malformed JSON is classified as a **provider-output failure** (`validation`), so
it is **rejected, never promoted**.

### Prompt-injection defence

All business/repository content is wrapped in a labelled `<<<LABEL … LABEL>>>`
data fence, and the system policy states that content inside those fences is
**data, never instructions**. A crafted string in a scanned page cannot override
the system policy.

---

## Error mapping

`classifyCategory` maps a sanitized transport category to the domain's stable
`ReasoningFailureKind` plus the finer disposition. No raw SDK/API error is ever
rethrown across the adapter boundary, and **no secret-bearing header or request
body appears in an error**.

| Provider failure | `ReasoningFailureKind` | Disposition |
|---|---|---|
| authentication (401) | `fatal` | non-retryable |
| permission (403) | `fatal` | non-retryable |
| invalid request (400) | `fatal` | non-retryable |
| context too large | `fatal` (`length`) | non-retryable |
| rate limit (429) | `retryable` | retryable + fallback-eligible |
| overloaded (529) | `retryable` | retryable + fallback-eligible |
| server error (5xx) | `retryable` | retryable + fallback-eligible |
| network failure | `retryable` | retryable + fallback-eligible |
| timeout | `timeout` | retryable (policy decides) |
| cancellation (abort) | `cancelled` | **never retried** |
| malformed response | `validation` | rejected, not promoted |
| unknown | `fatal` | non-retryable |

---

## Timeout and cancellation

One `AbortController` drives the in-flight request. The **first terminal source
wins** and is recorded, so the three sources are distinguishable:

- **user / system cancellation** (the domain `CancellationToken`) → `cancelled`,
  which the orchestrator never retries;
- **timeout** (`min(control.timeoutMs, config.defaultTimeoutMs)`) → `timeout`,
  which is retryable per policy;
- **deadline** (the job's absolute deadline) → `cancelled` by deadline.

The request promise is always awaited in a `try/finally` that clears the timeout
timer and the cooperative poll interval — **no orphaned promise, no leaked
interval**. A token already cancelled at dispatch (or a deadline already past)
short-circuits with no outbound call.

---

## Usage and cost

Actual token usage is read from the provider response and flows through the
Sprint-7 accounting path (`estimated: false`). When the provider omits usage
(never expected from Anthropic, but modelled), the adapter emits empty usage and
the existing **estimated-usage fallback** takes over (`estimated: true`) — actual
usage is never invented. Pricing comes from the provider descriptor's cost
metadata; **this sprint adds no pricing engine**.

---

## Live-test gate

The live test (`adapter.live.test.ts`) runs only when
`AUXION_RUN_LIVE_PROVIDER_TESTS=true` **and** the provider is enabled with a real
key. Absent the gate it **skips explicitly** — it never passes silently. It is
excluded from the default `pnpm test` (only `pnpm test:live` includes
`*.live.test.ts`), so **CI never spends API credit**.

The live request is deliberately tiny (128-token output cap, 20 s timeout) and
asserts: structured JSON, usage-or-estimated fallback, provider metadata, and no
raw content persisted. It logs an **approximate cost with no secret**.

---

## Local setup

```bash
# .env.local (never committed)
AUXION_LIVE_AI_ENABLED=true
AUXION_ANTHROPIC_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-...          # server-only; no NEXT_PUBLIC_ prefix

# run the live smoke test (spends a few cents)
AUXION_RUN_LIVE_PROVIDER_TESTS=true pnpm --filter @brightloop/providers test:live
```

## Staging setup

Set the three flags plus the key as **server-side environment secrets** (never in
a client-exposed variable). Leave `AUXION_RUN_LIVE_PROVIDER_TESTS` unset in CI so
the pipeline never spends credit. Enable the provider only on the server runtime
that will drive reasoning jobs.

## Production restrictions

- The provider stays **disabled by default**; enable it only when a live scan
  runtime is ready to consume it.
- The controlled execution path (`runControlledScanReasoning`) is a **server-side
  action, never a public endpoint** — there is no route for it in this sprint.
- The key lives only in server secrets. It is never logged, returned in an error,
  placed in a report, or committed to `.env`.

## Rollback / disable procedure

Set `AUXION_LIVE_AI_ENABLED=false` (global) or `AUXION_ANTHROPIC_ENABLED=false`
(provider) and redeploy the environment config. The registry drops the adapter,
routing no longer sees it, and no outbound request is made. No code change and no
data migration are involved.

---

## Related

- `packages/providers/src/anthropic/` — config, transport, errors, prompt,
  normalize, adapter, registration, controlled-run
- `packages/domain/src/scan-engine/execution/contract.ts` — the
  `ReasoningProviderAdapter` seam (Sprint 7)
- `packages/domain/src/scan-engine/execution/orchestrator.ts` — routing, retry,
  fallback, validation, accounting
- `apps/web/src/lib/providers.ts` — the server-only composition root
