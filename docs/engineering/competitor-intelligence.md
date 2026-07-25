# Competitor Intelligence Runtime Integration (Phase C · Sprint C8)

Makes Competitor Intelligence a **deterministic runtime capability** that analyzes
competitors ONLY from verified competitor evidence already in the bundle. It never
searches the internet, crawls, scrapes, calls a model, discovers competitors, or
infers a company name. When no competitor evidence exists it emits an explicit
UNAVAILABLE snapshot and the runtime continues — it never fails on absence.

```
evidence → graph → [competitor intelligence] → prospect intelligence
  → provider enrichment → grounding → findings → recommendations → report
```

## Where it runs

Competitor Intelligence runs as a deterministic step INSIDE the `finding_synthesis`
stage, immediately BEFORE Prospect Intelligence — preserving the flow's
`competitor → prospect` adjacency. It is deliberately **not** a new canonical
pipeline stage: adding one would reorder the 13-stage runtime (a runtime redesign,
out of scope for this sprint). The step persists a first-class `competitor_snapshot`
runtime artifact, so it fully participates in the runtime — lineage, checksum,
`artifact.persisted` event, checkpointing, and idempotent replay.

`competitor_snapshot` is already a `runtime_artifact_kind` enum member — **no
migration**.

## Evidence contract

The step reads ONLY bundle items with `source === "competitors"` and a usable
state (unavailable-state items never contribute). Each item's payload (`value`) is
read verbatim — nothing is inferred:

- `competitor` — the competitor name (copied, never inferred)
- `dimension` — the aspect the observation concerns
- `signal` — `differentiator | strength | weakness | opportunity | threat`
- `statement` — the normalized observation (bounded to 300 chars)
- `marketPosition` — `leader | challenger | follower | niche` (verbatim)
- `supportingEvidenceIds` — cited ids, each validated against the bundle

Every emitted statement references the KNOWN evidence ids that support it. A cited
id absent from the bundle is **rejected** (recorded in `rejectedEvidenceIds`, never
used). A statement always retains at least its own bundle-item id, so no statement
is ever unsupported.

## Snapshot schema

`competitorIntelligenceSnapshotSchema` (`@brightloop/schema`) — distinct from the
Sprint-10 `competitorSnapshotSchema` (candidates/benchmarks/gaps). Sections:
`status`, `reason`, `marketPosition`, `competitors` (ranked), `differentiators`,
`strengths`, `weaknesses`, `opportunities`, `threats`, `conflicts`,
`rejectedEvidenceIds`, `confidence`, `evidenceIds`, `sourceArtifacts`, `summary`,
`reviewRequired`, `checksum`, `generatedAt`, `formulaVersion`.

The `checksum` is content-addressed (FNV-1a over canonical JSON) EXCLUDING `id`,
`sourceArtifacts`, `generatedAt` and the checksum itself — so identical evidence
hashes identically regardless of artifact ids or clock.

## Confidence model

Confidence is CEILED by the **minimum** contributing-evidence confidence and is
only ever pulled DOWN — never inflated. Conflicting evidence (the same
competitor+dimension carrying both a positive and a negative signal) reduces
confidence by a fixed deterministic penalty per conflict, floored at zero. The band
reuses the engine's `confidenceBandFor` thresholds.

## Failure semantics

No competitor evidence → a deterministic snapshot with `status = unavailable`,
`reason = no_competitor_evidence`, empty buckets, zero confidence,
`reviewRequired = false`. The runtime continues normally; nothing is fabricated and
no stage blocks.

## Report + scanner

The internal report gains a bounded `competitorIntelligence` section (status,
competitor count, key differentiators, opportunity/threat counts, confidence,
review required; "Unavailable — no verified competitor evidence." when absent). The
Prospect Scanner surfaces a read-only status panel — Available / Unavailable /
Review Required, confidence, and evidence count — read from the persisted snapshot
(`competitor_snapshot` is now a readable artifact kind). No redesign.

## Determinism & safety (tested)

- No competitors → UNAVAILABLE; single → snapshot; multiple → deterministic
  ranking; conflicting → confidence reduction; unknown cited ids → rejection;
  duplicates → dedup; replay → identical checksum.
- Provider-independent: the snapshot is byte-identical whether or not a provider
  execution outcome exists.
- Resume/replay: idempotent persist — no duplicate `competitor_snapshot`.
- Full runtime discovery → report includes the competitor-intelligence section.
- No internet, no crawl/scrape, no model call, no fabricated competitors, no
  inferred names, no provider dependency.

Phase C remains incomplete: Proposal Intelligence, the Narrative Engine, and the
final all-engine deterministic validation are still deferred.
