# Internal Prospect Scanner (Phase C · Sprint C4)

The first operator-facing Auxion workflow: an authenticated internal user can point the
platform at a prospect's public website, advance the intelligence pipeline **one stage at a
time**, and inspect the evidence behind every result.

It adds **no new engine**. It is a surface over what C1–C3 already built:

```
Operator → /admin/prospect-scanner → @brightloop/application (C1)
                                   → POST /api/internal/runtime/run-once (C2.1 driver)
                                   → crawler stage executors (C3) | Claude adapter (C2)
                                   → RuntimeCoordinator → Engine → Repositories
```

---

## 1 · Operator workflow

1. **Create** — fill the prospect form (URL required; name, contact, industry, location and
   notes optional) with a crawl-page limit, a reasoning mode, and two mandatory
   acknowledgements (estimated cost, authorization to scan a public site). Creating a scan
   **queues the first stage and executes nothing**.
2. **Advance** — the workspace shows the exact next stage and whether it is supported. One
   click runs **exactly one** stage.
3. **Inspect discovery** — planned/fetched/excluded/robots-blocked/SSRF-blocked/failed counts,
   bytes, redirects, content-type distribution, crawl duration, and a per-page ledger with a
   bounded sanitized text preview.
4. **Inspect evidence** — per-item state (observed vs unavailable), source URL, freshness,
   checksum, covered vs missing sources, and explicit limitations.
5. **Check reasoning readiness** — a factor-by-factor panel resolving to one state.
6. **Run one controlled reasoning turn** — only when readiness is `ready`, and only after an
   explicit confirmation showing the model, token cap and estimated maximum cost.
7. **Review** — the structured report and proposal artifacts, then the internal prospect
   summary that prepares outreach.

## 2 · Authorization

- Both pages call `requireSurface("admin")` — every **client role is redirected away** at the
  surface, and there is no public or anonymous entry point.
- Both then `assertCapability(actor, "transformation.scan.write")`, so an internal role
  without scan-write sees an explicit "no access" panel rather than the tool.
- Every read and write goes through a C1 use-case, which authorizes against the **loaded
  run's `clientId`** — a caller can never assert ownership of an id they do not own.
- Runtime services are bound to the caller's **request-scoped RLS session**. No service-role
  key is used anywhere in this sprint.
- The internal run-once route keeps its own C2.1 gate (internal actor +
  `transformation.executions.write`).

## 3 · Data flow

Reads (server components → `lib/scanner-data.ts` → use-cases):

| View | Use-case |
|---|---|
| Scan status | `getScan` / `listScans` |
| Timeline | `getScanTimeline` |
| Discovery | `getScanArtifact(… , "discovery_manifest")` |
| Evidence | `getScanArtifact(… , "evidence_ingress")` |
| Report | `getScanReport` |
| Proposal | `getScanProposal` |

Writes: `createScan`, `cancelScan`, `retryScan` via server actions. Stage execution: the
C2.1 internal route. **React never calls a repository or a runtime service.**

`getScanArtifact` is the one addition this sprint needed — the smallest possible use-case,
with a **hard allowlist** of readable kinds (`discovery_manifest`, `evidence_ingress`,
`evidence_bundle`, `execution_outcomes`, `findings`, `recommendation_candidates`). A missing
artifact returns `null` (a legitimate empty state), not an error.

## 4 · Stage execution

The control posts to `POST /api/internal/runtime/run-once` with the scan's `clientId`, so the
C2.1 driver leases within the caller's tenant. **One click → at most one lease, one stage,
one outcome, one downstream enqueue.**

- The exact next stage and its support state are shown *before* execution.
- The button is disabled while a request is in flight, and an in-flight `ref` guard rejects a
  double-click that lands before React re-renders.
- A reasoning stage requires a **second, explicit confirm** and is only offered when
  readiness is `ready`.
- After a turn the page calls `router.refresh()` **once**. That is a single re-read, not
  polling.

### Why execution stays manual and one-stage-at-a-time

This is a deliberate safety property, not an unfinished feature:

- **Cost containment.** A reasoning stage spends real API credit. A human confirms each turn
  with the model, token cap and maximum cost in front of them.
- **Blast radius.** The crawler makes outbound requests to third-party sites. One stage per
  explicit click means a misconfigured target can never turn into a runaway crawl.
- **Debuggability.** Each turn produces one artifact, one checkpoint and one event, so an
  operator can read exactly what happened before deciding to continue.
- **The runtime is already correct without a worker.** The queue is Postgres and the
  coordinator is transactional; a worker loop would add availability, not correctness. Adding
  one is a separate, deliberate decision — not a side effect of building a UI.

There is no worker, cron, scheduler, interval, timer, WebSocket or auto-advance anywhere in
this sprint, and a test asserts their absence in every scanner component.

## 5 · Discovery, evidence and reasoning views

All three are built by `lib/prospect-scanner.ts`, a **pure, allowlist-only** module. Every
view is assembled by explicitly picking known fields and coercing them — an artifact envelope
is never spread, never passed through, and never rendered as markup.

- `boundedText` strips tag-like sequences and control characters, collapses whitespace and
  caps length. Non-string values coerce to `""` rather than `[object Object]`.
- Page previews are bounded sanitized **text nodes**. React escapes them, and no scanner
  component uses `dangerouslySetInnerHTML` (asserted by test).
- Timeline rows summarize an **allowlist of scalar detail keys**; the raw payload is never
  rendered, so a prompt or response inside a payload cannot surface.
- Report/proposal sections come from a fixed key allowlist; unknown keys are dropped. The
  proposal allowlist contains **no pricing key**.
- Execution results pick each field by name, so a future field cannot leak a raw response.

### Readiness states

`ready` · `blocked_by_discovery` · `blocked_by_evidence` · `provider_disabled` ·
`provider_unavailable` · `budget_exhausted` · `deadline_exceeded` · `already_complete`

`canExecute` is true **only** for `ready` — tested exhaustively — so a paid provider call is
never offered in any other state.

## 6 · Safety rules

1. Website content is untrusted data. Prompt-injection markers found by the crawler are
   **displayed as findings, never obeyed**.
2. No raw HTML is stored, returned, or rendered — only bounded sanitized text plus checksums.
3. No raw provider response, prompt, hidden reasoning, API key or provider header ever
   reaches the UI. The driver does not return them and the view models do not pick them.
4. Unavailable pages become **explicit unavailable evidence**. Nothing is inferred for a page
   that was never fetched.
5. The prospect summary is derived from structured artifacts only. An unevidenced field
   stays empty — **no sales copy is generated**.
6. Form validation reuses the Phase-A `normalizeUrl` + `evaluateSsrf`, evaluated on the **raw
   input** (normalization strips userinfo, so checking the canonical root would silently
   accept `https://user:pass@host`). The form therefore rejects exactly what the crawler
   would refuse to fetch.

## 7 · Kill switches

| Switch | Effect when off |
|---|---|
| `AUXION_CRAWLER_ENABLED` | Discovery stages report a stable `crawler_disabled` block. No outbound request. |
| `AUXION_LIVE_AI_ENABLED` + `AUXION_ANTHROPIC_ENABLED` | Readiness resolves to `provider_disabled`; the reasoning turn is never offered. No SDK client, no credit. |

Both default **off**. Their live state is shown as chips in the header and on the index, so
an operator always knows why a stage will block before clicking. A scan can still be created
with either switch off — it queues safely and blocks honestly rather than fabricating.

## 8 · Limitations

- No public or client-facing scanner; internal operators only.
- No worker, scheduler or auto-advance — every stage is a human click.
- Stages beyond discovery and reasoning (graph, synthesis, report assembly) have no runtime
  yet, so they return stable blocked results; the report and proposal views stay empty until
  those land.
- No PDF export, no email, no proposal sending, no pricing, no contract or e-signature.
- No WebSockets; refresh is manual (one re-read per action).
- Crawler limits still apply: no JavaScript execution, no authenticated crawl, no broad web
  search, no competitor discovery.

## 9 · Test strategy

The environment is node (no DOM), so the safety rules live in **pure modules** and are tested
directly rather than through rendering. That is the point: a guarantee proven in a pure
function cannot be undone by a careless component.

| Suite | Covers |
|---|---|
| `lib/prospect-form.test.ts` (27) | URL required, scheme, credentials, localhost/RFC1918/link-local/unspecified, lengths, no markup, page limits, mode, both acknowledgements, metadata construction |
| `lib/prospect-scanner.test.ts` (40) | `boundedText` (no raw HTML, no `[object Object]`), identity, next-stage support incl. disabled crawler/provider and unsupported stages, discovery projection, evidence states, **all 8 readiness states**, `canExecute` only when ready, execution view drops injected prompt/response/key, timeline drops raw payload, report/proposal allowlists, summary invents nothing, formatters |
| `prospect-scanner/scanner-actions.test.ts` (25) | Internal authorization (owner/team_member), client-role denial on create/cancel/retry, metadata persistence, invalid target creates nothing, duplicate submission, redirect behaviour, cancel/retry error taxonomy, and surface invariants: no `dangerouslySetInnerHTML`, no timer/interval/socket, exactly one fetch target (the run-once route), reduced-motion + mobile breakpoints, ARIA labels, capability gates on both pages |

No test makes a network call, spends API credit, or touches a live provider. The live
crawler/provider suites remain gated and excluded from the default run.
