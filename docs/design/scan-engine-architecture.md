# Business Intelligence Scan — Engine Architecture (foundation)

> Status: **contracts only.** The functional Business Scan (human/system-entered
> Diagnose) works today. This document describes the *future-ready* backend the
> contracts prepare for. No crawler, LLM call, benchmark API, proposal PDF, or
> billing unlock is implemented yet — those are later phases.

## Access levels (product surfaces)

| Tier | Surface | Sees |
|---|---|---|
| `public_preview` | Public teaser | Headline **Index** only |
| `registered_lead` | Post email-capture | Index + per-domain summaries (no evidence/competitors) |
| `internal_operator` | Auxion staff | Full report **+ the internal proposal engine** |
| `committed_client` | After deposit/subscription/engagement | Full report (evidence + competitors) |
| `admin_owner` | Unrestricted | Everything |

Entitlement is **billing-agnostic** (`EntitlementPolicy` / `EntitlementContext`):
it can later consume a subscription, a cleared deposit, a manual approval, or an
active engagement — no payment logic is wired in this task. The **internal
proposal engine** (`canGenerateProposal`) is an operator tool, gated by
capability, never by client tier.

## Full client scan — async pipeline

```
scan request → queued job → crawl → normalize → competitor discovery →
benchmark → AI orchestration → diagnose → synthesize (Insights/recommendations)
→ report / proposal
```

- `ScanJob` carries `status` + `stage` + retry budget; a worker advances one
  `SCAN_PIPELINE` stage at a time (`nextStage`). Nothing runs inline in a request.
- **Providers are ports** (`AiOrchestrator`, `CrawlerProvider`, `SearchProvider`,
  `BenchmarkProvider`, `DiagnosisSynthesizer`, `ScanJobQueue`). Adapters are
  selected at the composition root.
- **One AI seam, vendor-neutral.** `AiOrchestrator.run()` takes a structured-output
  request (JSON Schema + parser) and returns validated output + a `ModelInvocation`
  audit record. OpenAI / Anthropic / Google / DeepSeek each implement the same
  port — **no model-specific logic in domain services.**

## AI engine — deferred

Implemented now: the contracts (`@brightloop/schema/scan-engine`), the provider
+ entitlement + queue **ports** (`@brightloop/domain/scan-engine`), the pipeline
order, and tests. **Not** implemented: the crawler, paid competitor/benchmark
APIs, real LLM calls, the top-10 competitor engine, proposal PDF generation,
billing unlock, continuous monitoring.

## Security invariants (baked into the contracts)

- Crawled/searched content is **untrusted** (`EvidenceItem.trust = "untrusted"`);
  the crawler adapter owns **SSRF / private-network** rejection and allow-lists.
- **Observed facts** (`EvidenceItem`, `CompetitorBenchmark`) are stored **separately
  from AI inference** (`DomainDiagnosis.isInference`), linked by id — never merged.
- Every observation carries **provenance** (`sourceUrl` + `observedAt` + `providerId`).
- Model calls log **provider/model/version + structured-output metadata**
  (`ModelInvocation`) — **never hidden chain-of-thought.**
- Tenant isolation and the internal-only proposal tools stay behind existing RLS
  + `assertCapability`.

## Persistence plan (when the engine is built)

Additive migrations only, mirroring the current core-surfaces pattern
(internal-only RLS, `created_by` → `users(id)`, provenance columns):
`scan_requests`, `scan_jobs`, `scan_evidence`, `competitor_candidates`,
`competitor_benchmarks`, `domain_diagnoses`, `model_invocations`. Deferred until
the first adapter lands so the schema tracks a real provider's output.
