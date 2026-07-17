# Foundation Implementation Plan

Status: Draft
Owner: Auxion Engineering
Last updated: 2026-07-17

> The final planning document before production implementation. It resolves the four missing foundations
> from the Engineering Discovery Report into concrete, buildable architecture, fixes the open architectural
> decisions, defines the build sequence and first production slice, and ends with a start-build checklist.
> Ground truth: the Engineering Discovery Report, the Product Bible, and `00-engineering-principles.md`.
> This document plans; it writes no code and adds no packages.

**Deployment reality that shapes every decision:** the app runs on **Vercel serverless** (short-lived
functions) over **Supabase Postgres**. There is no persistent worker host today. This single fact drives the
durable-async and AI-runtime decisions below: long-running work cannot live in a request thread or a
permanent process — it must be a **Postgres-backed queue drained by scheduled, bounded invocations.**

---

## Foundation 1 — Transformation Domain

- **Objective:** Model the Product Bible's transformation cycle — Signal → Insight → Recommendation → Move →
  Measurement → Learning, plus Business Health, Transformation Index, Operational Risk, Knowledge Asset — as
  first-class domain entities with guarded lifecycles.
- **Existing capabilities to reuse:** the `schema/domain/data/db` layering; the state-machine + guarded
  `performTransition` seam; RLS + `custom_access_token_hook` tenant scoping; the capability model; the
  `Client`/`Organization` root; `analytics_events`.
- **Missing capabilities:** every transformation entity above; their state machines; their RLS policies;
  their repositories; the Recommendation→Approval→Move linkage as data.
- **Recommended architecture:** **extend the existing packages** (see Architectural Decisions) with a
  `transformation` sub-namespace: contracts in `schema/src/transformation/*`, pure logic + guards in
  `domain/src/transformation/*`, repositories in `data/src/transformation/*`, additive migrations in
  `db`. New lifecycles reuse `MACHINES` + `performTransition` verbatim.
- **Package & service boundaries:** contracts (`schema`) → logic/guards (`domain`) → persistence (`data`) →
  migrations/RLS/triggers (`db`); composed by server actions in `apps/web`. No new package.
- **Database entities / contracts required:** `signals`, `insights`, `recommendations`, `moves`,
  `measurements`, `business_health` (snapshots), `transformation_index` (series), `operational_risks`,
  `knowledge_assets`, and an `approvals` record (explicit human-approval rows). All `client_id`-scoped;
  status columns driven only by transitions.
- **Security & tenant isolation:** every table RLS-enabled and scoped to `auth.client_id`; internal roles by
  capability; extends the existing 34-table/89-policy model. No entity is readable across organizations.
- **Failure handling:** illegal transitions rejected by guard + DB trigger (409); writes validated at the
  boundary (Zod) so invalid state never persists.
- **Observability:** each transition emits an analytics/audit event with actor + before/after; risks and
  recommendations are queryable by status.
- **Testing:** unit tests for every machine and guard; **live-DB RLS tests** proving cross-tenant denial and
  approval-gate enforcement (new CI capability from Foundation 4).
- **Dependencies:** none external — this is the base foundation.
- **Non-goals:** no AI generation here (entities are populated manually/by seed until Foundation 2); no
  automation execution; no analytics dashboards.
- **Definition of Done:** entities + machines + RLS + repos exist; every lifecycle is guarded and audited;
  live-DB tests prove isolation and approval gating; migrations are additive and reversible.

## Foundation 2 — AI Foundation (the Auxiliary)

- **Objective:** Produce **Recommendations with evidence, uncertainty, and provenance** from transformation
  context, under the Human + AI contract, provider-independently.
- **Existing capabilities to reuse:** the provider-adapter pattern (`domain/src/adapters/*` with mock impls);
  server-only secret handling; RLS-scoped data access; the Recommendation entity (Foundation 1).
- **Missing capabilities:** a model-provider abstraction; prompt/version management; tenant-scoped context
  assembly; retrieval + memory; provenance persistence; the code-level non-decision enforcement.
- **Recommended architecture:** a new **`ai` package** — pure, provider-independent: a `ModelProvider` port
  (generate + embed), prompt templates with versions, a context assembler that reads **only through
  RLS-scoped repositories**, and pgvector-backed retrieval. It **returns Recommendation objects**; it never
  writes consequential state and never crosses an approval gate. Invoked server-side, and for anything slow,
  **on the durable runtime** (Foundation 3), not the request thread.
- **Package & service boundaries:** `ai` (abstraction + prompts + context logic) depends on `schema`/`domain`;
  never on `ui`; never called from the client. Consumed by server actions / workers only.
- **Database entities / contracts required:** `prompt_versions`; `ai_generations` (provenance: model id,
  prompt version, params, input/context refs, output ref, confidence, timestamp, actor/scope);
  `embeddings` (pgvector, `client_id`-scoped) for Knowledge Assets/context.
- **Security & tenant isolation:** context assembly queries only RLS-scoped data for the requesting scope;
  embeddings are tenant-scoped and RLS-enforced; provider secrets server-only; no raw client content in logs.
- **Failure handling:** provider timeout/error → the generation is a durable job that fails **visibly** and
  is retryable/idempotent; a failed generation never produces a partial Recommendation treated as valid.
- **Observability:** every generation records provenance; latency, cost, token counts, and failure rate are
  metered; monitoring surfaces model health and acceptance rate (Foundation 4).
- **Testing:** unit tests with a deterministic **mock provider**; contract tests for the port; tests proving
  AI output is always a Recommendation requiring Approval and cannot write state or read cross-tenant.
- **Dependencies:** Foundation 1 (entities), Foundation 3 for durable execution of slow calls, Foundation 4
  for monitoring.
- **Non-goals:** no autonomous action; no fine-tuning/training; no multi-model orchestration yet; no
  client-facing chatbot.
- **Definition of Done:** a Recommendation is produced from real context with full provenance, behind a
  provider port (mock + one real provider swappable by env), enforced in code as non-consequential.

## Foundation 3 — Automation Runtime (Orchestration)

- **Objective:** A durable substrate for long-running, retryable, scheduled, externally-dependent work
  (AI generation, Move execution, measurement), with run identity, status, idempotency, and human-approval
  gating.
- **Existing capabilities to reuse:** HMAC-verified inbound webhooks; `AutomationProvider` port + mock; the
  `automations` table + monitoring page; guarded transitions.
- **Missing capabilities:** a durable job queue; a worker/drainer; run lifecycle; retries/dead-letter;
  scheduling; an outbound-trigger contract.
- **Recommended architecture:** **Postgres-backed queue on the existing Supabase database** (a jobs/runs
  table or `pgmq`), drained by **scheduled, bounded invocations** (Vercel Cron and/or Supabase `pg_cron`
  calling an authenticated internal drain endpoint), because Vercel has no persistent workers. Each run has a
  durable identity + status machine (queued → running → succeeded/failed/dead-letter) driven by guarded
  transitions. Consequential work still passes an explicit human Approval before execution. n8n stays behind
  the `AutomationProvider` adapter for **outbound external-system integration only**, not core orchestration.
- **Package & service boundaries:** an **`automation` (orchestration) package** owning the runtime contract,
  queue interface, and run lifecycle; the drain endpoint lives in `apps/web`; providers behind adapters.
- **Database entities / contracts required:** `automation_runs` (id, kind, status, attempts, last_error,
  idempotency_key, payload_ref, actor/scope, timestamps); optional `scheduled_tasks`.
- **Security & tenant isolation:** runs are `client_id`/scope-tagged and RLS-scoped; the drain endpoint is
  authenticated (internal signature) and runs service-role only for the specific job; inbound callbacks stay
  HMAC-verified and idempotent.
- **Failure handling:** bounded retries with backoff; dead-letter on exhaustion; every failure visible and
  recoverable; all operations idempotent by `idempotency_key`.
- **Observability:** run status/attempts/errors queryable; the `/admin/automation` surface extended; metrics
  on queue depth, success/failure, latency.
- **Testing:** unit tests for the run machine + idempotency; integration tests for enqueue→drain→complete and
  retry→dead-letter; a test proving no consequential run executes without a prior Approval record.
- **Dependencies:** Foundation 1 (Move/entities), Foundation 4 (monitoring).
- **Non-goals:** no distributed workflow engine (Temporal/Inngest) yet; no user-authored workflows; n8n is
  not the core runtime.
- **Definition of Done:** a job can be enqueued, durably executed via scheduled drain, retried, dead-lettered,
  and observed; consequential runs are approval-gated; behavior survives a redeploy/crash.

## Foundation 4 — Observability and Verification

- **Objective:** Make AI, automation, and the transformation domain **observable before scalable**, and make
  security/isolation **verified**, not assumed.
- **Existing capabilities to reuse:** the CI quality gate (typecheck/lint/test/build + secret scan);
  `analytics_events`; the OpenTelemetry API dependency (present but unwired); Vitest (226 tests).
- **Missing capabilities:** tracing, metrics, health checks, structured logging, AI/automation monitoring;
  **live-DB and E2E tests** (CI runs placeholder-only today).
- **Recommended architecture:** wire **OpenTelemetry** (vendor-neutral traces + metrics, OTLP export —
  backend vendor deferred), **structured JSON logging**, in-app monitoring for AI generations and automation
  runs, and a health endpoint. Add a CI stage with **ephemeral Postgres** (Supabase local / Postgres service
  container) that applies migrations and runs **RLS/authz integration tests**, plus **Playwright E2E** on
  critical journeys against a seeded local stack.
- **Package & service boundaries:** a thin **`observability` module/package** (owned logging/trace/metric
  helpers) used by all server code; CI config in `.github/workflows`.
- **Database entities / contracts required:** none new beyond audit/run tables from Foundations 1–3;
  telemetry lives outside the tenant data model.
- **Security & tenant isolation:** telemetry carries identifiers + metadata only — **never raw client
  content, secrets, or full AI prompts/context** (invariant 15). CI never uses production secrets.
- **Failure handling:** observability is best-effort and never throws into business flows; missing telemetry
  degrades gracefully.
- **Observability:** this foundation *is* observability.
- **Testing:** the live-DB + E2E harness this foundation adds is itself the verification layer; it gates the
  first production slice.
- **Dependencies:** benefits from Foundations 1–3 existing to instrument; the CI harness can land first.
- **Non-goals:** no full APM/SIEM build-out; no log-analytics product; no per-request user analytics beyond
  existing events.
- **Definition of Done:** traces/metrics/structured logs flow for server actions, AI, and automation;
  AI/automation runs are monitorable; CI runs migrations + live-DB RLS tests + E2E on green.

---

## Architectural Decisions

Each resolved to the **simplest option** satisfying human-approval enforcement, tenant isolation, durability,
auditability, provider independence, maintainability, and incremental migration.

1. **Transformation entities → extend existing packages (no new bounded package).** *Why:* they share the
   exact patterns the current packages already provide (Zod contracts, state machines, guarded transitions,
   RLS, repository ports). A new package adds build/graph complexity for zero isolation benefit. Organize
   under a `transformation/` sub-namespace within `schema/domain/data`. *Revisit* only if the domain later
   needs an independent release cadence.
2. **AI runtime → a new `ai` package, invoked server-side (not a separate service, not Edge Functions, not
   client).** *Why:* a package keeps provider independence and testability with zero new deployment surface
   or ops burden; server-side invocation preserves RLS + secret safety; a separate service is unjustified
   operational weight at this stage. Slow calls run on the durable runtime, not the request thread.
3. **pgvector → yes, on the existing Supabase Postgres.** *Why:* reuses managed infra, keeps embeddings under
   the same RLS/tenant-isolation model, and avoids a second datastore (another ops + isolation surface). We
   own the store → provider independence. *Escalate* to a dedicated vector store only if scale demands it.
4. **Model-provider abstraction → an owned `ModelProvider` port (generate + embed) with mock + one real
   implementation, selected by env.** *Why:* mirrors the proven payment/e-sign/email adapter pattern; the
   platform depends on its own contract; every output persists model id + prompt version + params for
   provenance. No vendor SDK leaks past the port.
5. **Durable async substrate → Postgres-backed queue (`pgmq` or a jobs table) drained by scheduled bounded
   invocations (Vercel Cron / Supabase `pg_cron`).** *Why:* Vercel has no persistent workers, so a
   Postgres-native queue on existing infra is the simplest durable option — no new managed service, unified
   RLS/audit, idempotent by design. *Escalate* to a dedicated worker host or Inngest/Temporal only if job
   durations exceed serverless limits or throughput demands it (recorded as a known escalation path).
6. **n8n → external integration adapter only, not the core runtime.** *Why:* the Product Bible mandates "the
   app owns state; n8n only notifies." Consequential Moves/Execution are owned in-platform (durable runtime +
   guarded transitions + approval gates); n8n stays behind `AutomationProvider` for outbound third-party
   integrations. Inbound n8n callbacks remain HMAC-verified and idempotent.
7. **Observability stack → OpenTelemetry (traces + metrics, OTLP) + structured JSON logging + in-app
   AI/automation monitoring.** *Why:* OTel is already a dependency and is vendor-neutral (provider
   independence); the export backend is deferred/replaceable. Sensitive content is excluded by construction.
8. **Live-DB & E2E testing → CI stage with ephemeral Postgres (apply migrations, run RLS/authz integration
   tests) + Playwright E2E on critical journeys.** *Why:* closes the most dangerous gap (RLS/authz untested
   in CI) with standard, secret-free tooling; gates the first production slice.

---

## Build Sequence

Ordered phases. Observability hooks and risk-proportional tests are built into each phase's Definition of
Done, with a dedicated hardening phase before the slice goes production.

**Phase 1 — Transformation Domain & DB foundations.**
- *Goal:* the transformation entities exist, guarded and isolated.
- *Deliverables:* Zod contracts + state machines (`schema`); guards/logic (`domain`); repositories (`data`);
  additive migrations with RLS + triggers (`db`) for signals/insights/recommendations/moves/measurements/
  business_health/transformation_index/operational_risks/knowledge_assets/approvals.
- *Dependencies:* none.
- *Tests:* machine/guard unit tests; **live-DB RLS tests** (requires the Phase 4 CI harness — land that harness
  first or in parallel).
- *Exit criteria:* every lifecycle guarded + audited; cross-tenant denial proven; migrations reversible.

**Phase 2 — Verification harness (pull-forward of Foundation 4 testing).**
- *Goal:* CI can exercise a real database.
- *Deliverables:* CI ephemeral-Postgres stage applying migrations + running RLS/authz integration tests;
  Playwright scaffold.
- *Dependencies:* Phase 1 migrations.
- *Tests:* the harness itself, plus Phase 1's live-DB tests running green in CI.
- *Exit criteria:* CI runs migrations + live-DB RLS tests on every PR, secret-free.

**Phase 3 — AI Foundation.**
- *Goal:* Recommendations produced with evidence + provenance, behind a provider port.
- *Deliverables:* `ai` package; `ModelProvider` port (mock + one real); prompt_versions; ai_generations
  (provenance); pgvector embeddings + retrieval; context assembler over RLS-scoped repos.
- *Dependencies:* Phase 1.
- *Tests:* mock-provider unit tests; provenance completeness; proof AI cannot write state or read cross-tenant.
- *Exit criteria:* a real Recommendation with full provenance, non-consequential by construction.

**Phase 4 — Durable Automation Runtime.**
- *Goal:* durable, retryable, observable jobs with approval gating.
- *Deliverables:* `automation` runtime package; Postgres queue; scheduled drain endpoint (authenticated);
  automation_runs lifecycle; idempotency, retries, dead-letter; outbound adapter contract.
- *Dependencies:* Phases 1, 3 (to run AI generation durably).
- *Tests:* run-machine + idempotency unit tests; enqueue→drain→complete + retry→dead-letter integration;
  no-approval-no-execution test.
- *Exit criteria:* jobs survive redeploy/crash; consequential runs approval-gated; runs observable.

**Phase 5 — Observability completion.**
- *Goal:* full traces/metrics/logs + AI/automation monitoring.
- *Deliverables:* OTel wiring; structured logging; health endpoint; monitoring surfaces; E2E on critical
  journeys.
- *Dependencies:* Phases 1–4.
- *Tests:* telemetry presence checks; sensitive-data-exclusion test; E2E green.
- *Exit criteria:* AI + automation observable; slice journeys pass E2E.

**Phase 6 — First Production Slice (vertical integration).** See next section.
- *Exit criteria:* the end-to-end slice is real, observed, tested, and Product-Bible-aligned.

---

## First Production Slice

The smallest complete vertical that proves the whole architecture:
**Signal → Insight → AI Recommendation → Human Approval → Move → Execution Tracking → Measurement.**

- **Required database entities:** `signals`, `insights`, `recommendations`, `approvals`, `moves`,
  `automation_runs`, `measurements`, `ai_generations`, plus audit events — all `client_id`-scoped.
- **Backend services:** transformation domain services + guarded transitions; the `ai` recommendation
  service; the `automation` runtime for Move execution + measurement; explicit approval-record write.
- **AI capability:** given a Signal + Insight + RLS-scoped context, produce **one Recommendation** with
  evidence, confidence, and full provenance. Non-consequential by construction.
- **UI surfaces:** an internal view (Command Center) to see a Signal→Insight→Recommendation, **approve** (the
  human gate), and watch the Move execute and the Measurement land; minimal, using `@brightloop/ui`.
- **Automation behavior:** on Approval, enqueue a durable Move-execution run (real queue + drain), then a
  measurement run; both idempotent, retryable, observable.
- **Audit records:** the approval (who/what/when), the recommendation→decision→move linkage, every transition,
  and the ai_generation provenance — all persisted and immutable.
- **Tests:** live-DB RLS/isolation; approval-gate enforcement (no Move without Approval); AI-cannot-write-state;
  idempotent run; E2E of the full path.
- **What remains mocked:** the concrete model provider *may* run in mock mode for the demo, but the port,
  provenance, and non-decision enforcement are real; external third-party integrations (n8n outbound) stay
  mocked.
- **What must be real:** the transformation entities + RLS; the human Approval record and gate; the durable
  automation run (real queue/drain/retry); the audit + provenance trail; tenant isolation. **These prove the
  architecture; nothing about the human-authority, isolation, durability, or auditability guarantees is
  simulated.**

---

## Implementation Risks

| Risk | Mitigation |
|---|---|
| **Serverless has no persistent worker** (Vercel) — durable jobs could stall. | Postgres queue + scheduled bounded drain (Vercel Cron / `pg_cron`); idempotent runs; documented escalation to a worker host if durations exceed limits. |
| **AI context could leak across tenants** if assembly bypasses RLS. | Context assembler reads **only** through RLS-scoped repositories; embeddings `client_id`-scoped + RLS; tests prove cross-tenant denial. |
| **AI silently becoming an actor** (crossing an approval gate). | Non-decision enforced in code: AI returns Recommendations only; consequential paths require an Approval record; explicit test. |
| **Long AI calls exceed function timeout.** | Run generation as a durable job, not in the request; chunk/stream where needed. |
| **Provider lock-in / outage** (model or automation vendor). | Owned ports (`ModelProvider`, `AutomationProvider`); mock fallback; env-swappable; failure modes defined. |
| **Migration risk under a live system.** | Additive, compatibility-aware migrations; reversible or documented recovery; live-DB CI tests before merge. |
| **Sensitive data in telemetry.** | Structured logging/telemetry carries identifiers + metadata only; exclusion test in CI. |

---

## Start-Build Checklist

Production implementation may begin when **all** are true:

- [x] Product Bible approved and stable (v1.0).
- [x] Engineering Discovery Report established as ground truth.
- [x] Engineering Principles ratified (`00-engineering-principles.md`).
- [x] Four foundations resolved with Definitions of Done (this document).
- [x] Architectural decisions made and justified (this document).
- [x] Build sequence and first slice defined (this document).
- [x] Frozen baseline available as substrate (`brightloop-frozen-v1`) with reuse map.
- [ ] **This plan committed** to the repository.
- [ ] Phase 1 + Phase 2 scoped as the first working branch (transformation domain + live-DB CI harness).
- [ ] Provider/vendor selections for the *real* model provider and OTLP backend noted (can start on mock +
      deferred backend; not a blocker for Phase 1–2).

When the three open boxes are checked, **Claude Code may begin production implementation at Phase 1.**
