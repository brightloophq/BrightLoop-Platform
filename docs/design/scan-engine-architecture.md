# Business Intelligence Scan — Engine Architecture (foundation)

> Status: **contracts only.** The functional Business Scan (human/system-entered
> Diagnose) works today. This document describes the *future-ready* backend the
> contracts prepare for. No crawler, LLM call, benchmark API, proposal PDF, or
> billing unlock is implemented yet — those are later phases.
>
> **Canonical spec:** PDF 26 `docs/design/source/26-Business-Intelligence-Scan.pdf`
> — **3 surfaces**, **15 screens**, **5 roles**, **9 scan stages**. Each screen is
> tagged with a delivery class: **MVP** (ships first), **LATER** (phase two),
> **REQUIRES AI ENGINE**, **REQUIRES EXTERNAL DATA PROVIDER**.

## Three surfaces (PDF 26)

1. **Public Scan** — lead generation: URL intake → limited diagnosis → lead
   capture → locked full report. Limits: **3 free scans/day**, no complete
   competitor report, no full blueprint, no downloadable proposal, no sensitive
   recommendations.
2. **Internal Intelligence** — operator-only prospect queue (`ProspectState`:
   queued → scanning → diagnosed → awaiting_proposal → proposal_sent), full-engine
   scan, and branded **proposal generation** (regenerate section → manager approve
   → export PDF → send → share link, with audit history).
3. **Client Full Scan** — committed clients unlock the full diagnosis + up-to-10
   competitor benchmarking + System Map + continuous monitoring, on **any one**
   activation path (approved engagement / deposit / active subscription / manual
   approval).

## Access levels — five roles (PDF 26 §15 matrix)

| Role (PDF 26) | `EntitlementTier` | Sees |
|---|---|---|
| VISITOR | `public_preview` | Run limited public scan; headline **Index** only |
| LEAD | `registered_lead` | Save preview & request consult; Index + per-domain summaries |
| OPERATOR | `internal_operator` | Run full prospect scan; full diagnosis + competitors; **build & send proposals** |
| CLIENT | `committed_client` | Unlock client full report; continuous monitoring & rescan |
| ADMIN | `admin_owner` | Everything + manage entitlements/overrides + audit history |

The canonical §15 "who sees what" matrix is the source of truth for exact cell
access; `defaultEntitlementPolicy` encodes a conservative default to be refined
against it in Phase C.

Entitlement is **billing-agnostic** (`EntitlementPolicy` / `EntitlementContext`):
it can later consume a subscription, a cleared deposit, a manual approval, or an
active engagement — no payment logic is wired in this task. The **internal
proposal engine** (`canGenerateProposal`) is an operator tool, gated by
capability, never by client tier.

## The nine canonical scan stages (async pipeline)

Progress reflects **real work, never a timer**. Every stage is a **checkpoint**;
a dropped job resumes from `lastCompletedStage`, and cancellation is supported at
any stage. Sources that can't be read are marked **unavailable**, never estimated.

```
1 discovering  → 2 crawling → 3 identifying_competitors → 4 collecting_evidence →
5 benchmarking → 6 diagnosing → 7 generating_insights →
8 building_recommendations → 9 preparing_report
```

- `ScanJob` carries `status` (queue/terminal) + `stage` (1 of 9) +
  `lastCompletedStage` (resume point) + retry budget; a worker advances one
  `SCAN_PIPELINE` stage at a time (`nextStage`). Nothing runs inline in a request.
- **Evidence basis** — every finding is labelled `observed` / `estimated` /
  `inferred` / `unavailable` (`EvidenceBasis`, on `DomainDiagnosis`). This is the
  epistemic grounding, distinct from `ScanEvidenceItem.trust` (input-security).
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
