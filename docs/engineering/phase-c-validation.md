# Phase C — All-Engine Deterministic Validation (Sprint C11)

The certification that the complete deterministic runtime is production-ready. This
is validation only — it adds no production behavior. The suite
(`packages/application/src/pipeline/all-engine-validation.test.ts`) drives the whole
chain in one place so future CI always re-certifies it.

## Runtime topology

```
discovery_manifest → evidence_bundle → intelligence_graph → graph_snapshot
  → reasoning_jobs → [provider_execution*] → validated_claims
  → competitor_snapshot → findings → recommendation_candidates → proposal
  → narrative → internal_intelligence_report
```

Competitor Intelligence runs inside `finding_synthesis`, Proposal Intelligence
inside `recommendation_candidates`, and the Narrative Engine inside
`report_assembly`. `provider_execution*` is the only provider-driven stage and is
disabled by default — the deterministic path completes with no provider.

## Artifact flow

Every stage emits exactly one content-addressed artifact and consumes only the
upstream artifacts it declares. The report is assembled from all engine outputs and
the Narrative Engine is its presentation layer.

## Determinism guarantees

Two independent runs with identical inputs produce identical checksums for every
artifact — evidence, graph, snapshot, reasoning jobs, validated claims, competitor,
findings, recommendations, proposal, narrative, and report. Checksums are computed
over content only (artifact ids and clock excluded), so there is no drift.

## Replay guarantees

Replaying a completed run re-persists nothing new: each `(run, kind, version)` with
identical content is an idempotent replay, leaving exactly one version per artifact
kind. Lineage and the report checksum are unchanged.

## Resume guarantees

Resuming the tail stages reuses existing artifacts and keeps proposal, narrative,
and report checksums stable — no duplication, correct checkpoints.

## Lineage guarantees

Every artifact traces back to discovery:
`report ← narrative ← {findings, competitor, proposal} ← evidence_bundle ← discovery_manifest`.
Every report section remains traceable to its source artifact and evidence ids.

## Provider boundary

The provider is advisory only. Deterministic findings are authoritative; validated
provider claims can only enrich, never override, and provider confidence can never
exceed the backing evidence. With the provider disabled, enrichment is marked
`unavailable` and the deterministic report still completes. No raw provider output,
prompt, or chain-of-thought is persisted in any artifact.

## Security guarantees

- No raw provider output / prompt / chain-of-thought in any artifact.
- No internet or network in tests or CI; no live model calls.
- No fabricated findings, competitors, proposals, or narrative — every statement
  references evidence; unavailable sources are stated, never invented.
- Confidence never increases downstream (narrative ≤ report; proposal/competitor
  ceiled by minimum backing evidence).
- Partial intelligence (competitor / proposal / narrative unavailable) completes
  the runtime safely rather than failing.

## Certification scope

This suite certifies execution, determinism, replay, resume, lineage, partial-
intelligence safety, provider boundary, and report consistency for the merged
runtime. It changes no production code and persists no data outside the in-memory
test runtime.
