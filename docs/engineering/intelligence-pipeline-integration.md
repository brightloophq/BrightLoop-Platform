# Intelligence Pipeline Integration (Phase C · Sprint C6)

Wires the deterministic **evidence → Prospect Intelligence → reviewable-artifact**
spine as a *controlled application-layer integration*. Before C6, the Prospect
Intelligence Engine (C5) was proven pure logic that nothing on the runtime
invoked, and the scanner's report panel was empty on a live scan. C6 closes that
gap without a new engine, a provider call, a migration, or any network I/O.

```
discovery_manifest  →  evidence bundle  →  Prospect Intelligence
                                            → findings
                                            → recommendation_candidates
                                            → internal_intelligence_report
```

## Why an application service, not nine runtime executors

The C6 required flow is the **deterministic** chain (evidence → bundle → …
→ prospect intelligence → reviewable artifacts). It deliberately does **not**
route through the LLM. The canonical 13-stage runtime pipeline, by contrast,
routes through `provider_execution` (Claude) in the middle. So the deterministic
assessment is not a re-ordering of the 13 stages — it is a parallel,
provider-free path. The sprint objective names it precisely: *"the controlled
application-layer integration."* It is implemented as an application use-case
(`assessProspect`) that orchestrates existing engines and persists through the
existing `ArtifactService`. It re-implements no scoring.

## What it reuses (composition, not duplication)

- **`normalizeEvidence`** (Evidence Engine) — builds each `EngineEvidenceItem`
  with freshness, reliability, provenance quality and confidence. The bridge only
  supplies the observed signal `value`.
- **`runProspectIntelligence`** (C5) — the entire assessment.
- **`ArtifactService.persist`** — checksums, lineage (`sourceArtifactIds`),
  idempotency (same run+kind+version+content → *replayed*), and the
  `artifact.persisted` event, all for free.

## The evidence normalization bridge

`normalizeDiscoveryToEvidence` maps a `discovery_manifest`'s crawled pages into
engine evidence:

- one aggregate `website` item carrying site-wide signals (has-services-page,
  is-https, social count, …);
- one `pages` item per successfully fetched page carrying page-level signals;
- one `unavailable` `pages` item per failed page, carrying **no** signal.

A signal is set **only when the crawl observed it**. An unobserved key (e.g.
security headers, which the crawl does not currently capture) is simply absent, so
the Prospect-Intelligence registry *excludes* it — never a fabricated zero. This
is the single most important invariant of the bridge.

## Outcome model

| Status | Meaning |
|---|---|
| `blocked` | A prerequisite is absent (no discovery manifest). Names the missing prerequisite. Not a failure. |
| `failed` | An artifact read or persist failed. Carries a failure category. |
| `completed_with_gaps` | Ran, but nothing was fetched or no category could be scored — an honest, empty assessment, never a zero. |
| `completed` | A real maturity score was produced. |

Every completed/gapped run still produces reviewable artifacts and sets
`reviewRequired: true`.

## Lineage

```
internal_intelligence_report  ─┐
recommendation_candidates      ├─ sourceArtifactIds → evidence_bundle
findings                       ─┘                        │
                                                          └─ sourceArtifactIds → discovery_manifest
```

Evidence ids assigned by the bridge survive into the bundle and into every
finding/recommendation that cites them — asserted by test.

## Idempotency & resume

Engine and evidence ids are derived from **stable natural identity**
(`ev:<scanId>:<suffix>`, `<prefix>:<scanId>:<index>`), never from a random id
generator. An identical manifest therefore yields identical envelopes and
identical checksums, so a re-run **replays** (returns the existing artifact) with
no duplicate version — proven by the `idempotent re-run` test. The runtime
checkpoint/queue conventions are untouched; the assessment is a read-then-persist
that is safe to repeat.

## Confidence is never inflated

The report's aggregate confidence is `≤` the maximum confidence of the observed
evidence in the bundle — asserted by test. The Prospect-Intelligence non-inflation
cap (`min(assessment, evidence)`) carries through unchanged.

## Human review is mandatory

The `internal_intelligence_report`, `findings` and `recommendation_candidates`
artifacts are persisted `unvalidated`. The scanner surfaces the report with a
"machine-derived — review required" banner rather than the C1 "approved report"
gate (which only exposes a `valid` report). Nothing auto-approves.

## Scanner integration

`getScanAssessment` returns the assessment artifacts with their validation status.
The workspace shows a **Run assessment** control (disabled until a discovery
manifest exists), a review-required banner, and renders the report through the
existing `InternalReportView` — no UI redesign, no new public route.

## Authorization

- `assessProspect` (write) → `transformation.scan.write` on the loaded run.
- `getScanAssessment` (read) → `transformation.read` on the loaded run.
- Both authorize against the loaded run's `clientId`; a client role is denied
  (tested over the wire). RLS is unchanged; no service-role in browser code.

## Scope boundary (what C6 does NOT do)

C6 is the **first** integration increment — the highest-value one from the Phase-C
review. The following are **mapped but deferred** to later increments, because
each needs either the live provider stage or an additional input-adaptation
bridge, and forcing them now would risk the non-negotiables:

- the LLM reasoning path (`reasoning_job_creation` → `grounding_validation`);
- graph assembly, decision-science ranking, competitor intelligence;
- proposal-intelligence and narrative (they consume `EngineRecommendation` /
  validated claims, which need their own adapters);
- pricing, monitoring, connectors, execution automation (out of Phase C).

The engine-to-stage mapping for all of these is recorded in the sprint report so
the next increment starts from a plan, not a blank page.

---

## C6.2 checkpoint status (verified runtime spine)

This document began at C6.1. The runtime spine has since been extended:

- **C6.2a** wired `evidence_validation`, `graph_assembly`, `graph_snapshot` as real
  runtime executors.
- **C6.2b** wired `reasoning_job_creation`, `provider_routing` (control-only),
  `grounding_validation`, `finding_synthesis` (Prospect Intelligence),
  `recommendation_candidates`, and `report_assembly`.
- **C6.2c** closed the provider input seam: `provider_execution` now consumes the
  `reasoning_jobs` artifact for its input and carries lineage to it, with a
  backward-compatible fallback and **no raw provider output persisted** (the
  `execution_outcomes` envelope stays metadata-only).

**All 13 canonical stages now have executors.** A scan runs discovery → internal
reviewable report entirely through the controlled runtime, deterministically, with
the provider disabled (the default). Evidence lineage is preserved end to end,
confidence is never inflated, unavailable values stay unavailable, and human
review is required on the machine-derived report.

### Phase C is NOT complete

Explicitly deferred:

1. **Safe provider claim-enrichment** — `execution_outcomes` is metadata-only by
   design; surfacing validated (non-raw) claims to `grounding_validation` needs a
   careful contract change.
2. **Competitor Intelligence** — no competitor evidence exists from a public
   crawl; the honest integration is an explicit *unavailable* snapshot.
3. **Proposal Intelligence** — needs a `ProspectRecommendationInput →
   EngineRecommendation` adapter.
4. **Narrative Engine** — needs a findings/claims adapter.
5. **Extended report/scanner projection** and the **final all-engine end-to-end
   test** depend on 1–4.

This checkpoint is the verified deterministic-runtime spine, not final Phase C
completion.
