# Business Intelligence Scan — Implementation Roadmap

> **Preparation only — nothing here is implemented.** Foundation shipped: contracts,
> provider ports, entitlement policy, pipeline order, tests (see
> `scan-engine-architecture.md`). Phases below build on that.
>
> **Sequencing rationale:** **Phase A (internal prospect scanner) ships first** — it
> lets operators generate branded proposals and directly supports sales *before* the
> public and client-facing engines exist. Public (B) and client entitlement (C)
> follow; the heavy infrastructure (D–H) is layered underneath as capacity allows.
>
> ⚠️ Scope reference `26-Business-Intelligence-Scan.pdf` is not yet in the repo;
> reconcile phase details against it when available.

Complexity: **Low / Medium / High** (relative eng effort + risk).

---

## Phase A — Internal Prospect Scanner MVP  ·  **priority 1**  ·  Complexity: **Medium**

- **Business objective:** Let an operator scan a prospect and produce a credible,
  branded diagnosis + Index to drive a sales conversation — before any public or
  client engine exists. Revenue-supporting from day one.
- **Product surfaces:** `/admin/business-scan` (extend: enter a target URL, "Run
  intelligence scan", live job status, evidence-backed findings, per-domain
  diagnosis, confidence badges). Internal-only.
- **Backend capabilities:** `ScanRequest` → `ScanJobQueue` (single-worker ok),
  stage runner over `SCAN_PIPELINE`, **manual + system evidence entry** (no crawler
  yet — operator can paste/confirm), `DiagnosisSynthesizer` behind a single
  `AiOrchestrator`, `startDiagnosis` already idempotent.
- **External services:** One LLM provider (Anthropic) behind `AiOrchestrator`. No
  crawler/benchmark vendors yet.
- **Schema additions:** `scan_requests`, `scan_jobs`, `scan_evidence`,
  `domain_diagnoses`, `model_invocations` (additive, internal-only RLS, `created_by`
  → `users(id)`, provenance columns).
- **Security risks:** LLM prompt-injection from any pasted evidence (treat as
  untrusted); secret handling for the provider key (server-only); tenant isolation
  on prospect data. **No** SSRF surface yet (no crawler).
- **Testing:** job lifecycle (queue→run→succeed/fail), idempotent re-run, capability
  denial, orchestrator adapter contract (mock), evidence↔inference separation,
  RLS/pgTAP for new tables.
- **Exit criteria:** an operator runs a scan on a URL, gets a persisted Index +
  per-domain diagnosis with confidence + evidence provenance, all internal-only,
  gate green.
- **Dependencies:** scan-engine foundation (done); the `created_by` fix pattern
  (issue #11) applied to new tables from the start.

## Phase B — Public Limited Scanner  ·  Complexity: **Medium**

- **Business objective:** Lead generation — an anonymous visitor gets a teaser Index
  for their site, capturing an email to unlock more.
- **Product surfaces:** public marketing route (e.g. `/scan`) — URL input, headline
  Index only, email-capture gate to `registered_lead`.
- **Backend capabilities:** rate-limited public `ScanRequest` intake, `EntitlementPolicy`
  gating (`public_preview`/`registered_lead`), abuse/throttle controls, queue reuse.
- **External services:** same LLM seam; a lightweight fetch for basic public signals
  (deferred to D for full crawl).
- **Schema additions:** `leads` linkage to `scan_requests`; rate-limit/attempt table.
- **Security risks:** **SSRF** (public-supplied URL — must reuse the crawler's
  private-network guard), abuse/DoS, PII in captured emails, cost control on LLM.
- **Testing:** entitlement redaction per tier, rate-limit, SSRF-guard, anon→lead
  transition.
- **Exit criteria:** anonymous teaser + email capture live, redactions enforced,
  abuse-guarded.
- **Dependencies:** A (engine), C's entitlement resolver, D's SSRF guard (or a
  minimal guard shipped here).

## Phase C — Client Entitlement & Full Report  ·  Complexity: **Medium**

- **Business objective:** Committed clients see the full evidence-backed report;
  entitlement decoupled from billing mechanism.
- **Product surfaces:** `/portal` report view (client-scoped), `/admin` entitlement
  controls (manual approval).
- **Backend capabilities:** `EntitlementPolicy` adapter resolving
  `EntitlementContext` from engagement/manual-approval signals; report assembly
  respecting `ReportEntitlement`; capability-gated proposal access.
- **External services:** none new (billing integration deferred to G/separate).
- **Schema additions:** `report_entitlements`/engagement linkage; competitor +
  benchmark tables become visible per entitlement.
- **Security risks:** cross-tenant leakage (RLS on client report reads), redaction
  correctness, privilege escalation via entitlement forging.
- **Testing:** per-tier visibility matrix, cross-tenant denial, manual-approval flow,
  redaction snapshot tests.
- **Exit criteria:** a committed client sees the full report; lower tiers correctly
  redacted; proposals internal-only.
- **Dependencies:** A; entitlement resolver.

## Phase D — Crawler & Evidence Ingestion  ·  Complexity: **High**

- **Business objective:** Replace manual evidence with automated, provenance-tracked
  crawling (site content, meta, performance).
- **Product surfaces:** none new (feeds existing scan views); admin evidence viewer.
- **Backend capabilities:** `CrawlerProvider` adapter, evidence normalization,
  sanitization pipeline, robots/politeness, ret/backoff in `ScanJobQueue`.
- **External services:** headless-fetch/performance vendor (e.g. Lighthouse/PSI),
  optional managed crawler.
- **Schema additions:** expand `scan_evidence` (raw+normalized+sanitized, fetch
  metadata).
- **Security risks:** **SSRF / private-network / cloud-metadata** access (hard block
  loopback/link-local/RFC1918 + allow-lists), untrusted-content injection into LLM,
  content-size/zip-bomb limits, storing sanitized (not raw executable) content.
- **Testing:** SSRF matrix (must reject internal targets), sanitization, normalization
  golden tests, provenance completeness, retry/backoff.
- **Exit criteria:** scans run with zero manual evidence; every item carries
  provenance; SSRF suite green.
- **Dependencies:** A (evidence contracts + job runner).

## Phase E — Competitor Intelligence Providers  ·  Complexity: **High**

- **Business objective:** Benchmark the prospect against real competitors (the
  "top-N competitor" engine).
- **Product surfaces:** competitor section in the report; operator confirm/reject of
  `CompetitorCandidate`s.
- **Backend capabilities:** `SearchProvider` (discovery) + `BenchmarkProvider`
  (metrics), operator confirmation gate before candidates enter the report.
- **External services:** search API, SEO/performance/benchmark APIs (paid).
- **Schema additions:** `competitor_candidates`, `competitor_benchmarks` (already
  contracted) as tables.
- **Security risks:** third-party data licensing/ToS, cost runaway, injection via
  competitor content, mis-attribution (confidence + operator confirm required).
- **Testing:** discovery→confirm→benchmark flow, provider adapter contracts, cost
  guardrails, benchmark provenance.
- **Exit criteria:** confirmed competitor benchmarks appear per entitlement with
  provenance + confidence.
- **Dependencies:** D (evidence), C (entitlement gating of competitor data).

## Phase F — Multi-Model Orchestration  ·  Complexity: **High**

- **Business objective:** Route tasks across providers (OpenAI/Anthropic/Google/
  DeepSeek) for quality/cost/latency; resilience via fallback.
- **Product surfaces:** admin observability (per-task provider/version/latency).
- **Backend capabilities:** multiple `AiOrchestrator` adapters + a router (per-task
  policy, fallback, structured-output validation), full `ModelInvocation` logging.
- **External services:** the four LLM vendors.
- **Schema additions:** extend `model_invocations` (routing decision, fallback chain);
  no chain-of-thought stored.
- **Security risks:** key sprawl/rotation, cross-provider data-residency, prompt-
  injection consistency, structured-output schema drift per vendor.
- **Testing:** router policy, fallback on provider failure, structured-output
  validation per vendor, invocation-audit completeness.
- **Exit criteria:** tasks route + fall back across ≥2 providers with audited,
  schema-valid outputs.
- **Dependencies:** A (single-seam orchestrator already vendor-neutral).

## Phase G — Proposal Generation  ·  Complexity: **High**

- **Business objective:** Turn a scan into a branded proposal/PDF an operator can
  send — the internal sales payoff.
- **Product surfaces:** `/admin` proposal builder + export; internal-only, capability-
  gated (`canGenerateProposal`).
- **Backend capabilities:** `ProposalGenerationRequest` handling, templated
  assembly from `ScanResult`, PDF/branding renderer, versioning.
- **External services:** PDF renderer; optional e-sign/billing hook (billing itself
  stays separate).
- **Schema additions:** `proposals`, `proposal_versions`.
- **Security risks:** internal-tool exposure (capability + RLS), data leakage into
  exported artifacts, template injection, correct redaction in exports.
- **Testing:** capability gate, proposal assembly golden tests, export integrity,
  redaction in output.
- **Exit criteria:** operator generates + exports a branded proposal from a scan;
  internal-only.
- **Dependencies:** A/C (scan result + entitlement), F (quality).

## Phase H — Continuous Monitoring  ·  Complexity: **High**

- **Business objective:** Re-scan committed clients on a schedule; surface drift as
  Signals into the transformation loop.
- **Product surfaces:** Console signals from monitoring; schedule controls.
- **Backend capabilities:** scheduler → recurring `ScanRequest`s, diff/drift
  detection, Signal emission, cost/rate governance.
- **External services:** scheduler/cron infra; reuses D/E providers.
- **Schema additions:** `scan_schedules`, drift/history tables.
- **Security risks:** cost runaway (recurring paid calls), stale-provenance, alert
  fatigue, tenant-scoped scheduling.
- **Testing:** schedule firing, drift detection, Signal emission, cost caps.
- **Exit criteria:** scheduled re-scans emit drift Signals into the loop, cost-capped.
- **Dependencies:** D, E, and the transformation Signals module.

---

### Dependency summary

```
A (internal MVP) ──┬─> B (public)        depends on A + minimal SSRF guard
                   ├─> C (client full)   depends on A
                   └─> D (crawler) ─> E (competitors) ─> H (monitoring)
A ─> F (multi-model)         F + C ─> G (proposals)
```

Ship **A** first; everything else layers on it.
