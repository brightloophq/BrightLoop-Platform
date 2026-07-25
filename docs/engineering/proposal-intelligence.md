# Proposal Intelligence Runtime Integration (Phase C · Sprint C9)

Makes Proposal Intelligence a **deterministic runtime capability** that converts
evidence-backed recommendation candidates into STRUCTURED proposal objects. It is
not a proposal writer: it produces structured recommendation items only — never
marketing copy, never narrative, never AI-generated prose. It calls no provider
and no network. When evidence is insufficient it emits an explicit UNAVAILABLE
snapshot and the runtime continues.

```
findings → recommendation_candidates → [proposal intelligence] → report
```

## Where it runs

Proposal Intelligence runs as a deterministic step INSIDE the
`recommendation_candidates` stage, right after the candidates are derived —
preserving the flow's `recommendations → proposal` adjacency. It is deliberately
**not** a new canonical pipeline stage (that would reorder the 13-stage runtime, a
redesign out of scope). The step persists a first-class `proposal` runtime
artifact (already a `runtime_artifact_kind` — **no migration**), so it participates
fully in the runtime: lineage, checksum, `artifact.persisted` event, checkpoint,
idempotent replay. `report_assembly` reads it into a bounded report section.

## Inputs (evidence only)

- `recommendation_candidates` — the deterministic, evidence-backed candidates
  (id, title, category, problemStatement, proposedAction, affectedDimensions,
  impact, effort, evidenceIds, riskIds, confidence, limitations).
- `findings` — strengths/weaknesses; a category present in BOTH is a conflicting
  finding.
- `evidence_bundle` — per-evidence confidence, used as the ceiling.

No external sources, no internet, no provider calls.

## Proposal schema

`proposalIntelligenceSnapshotSchema` (`@brightloop/schema`) — distinct from the
Sprint-11 `proposal*` builder. Each item: `id`, `title`, `problem`,
`recommendedSolution`, `businessImpact`, `priority`, `estimatedEffort`,
`dependencies`, `risks`, `confidence`, `supportingEvidenceIds` (≥1),
`reviewRequired`, `status` (`ready`/`blocked`). The snapshot adds `status`,
`reason`, `counts`, `conflicts`, overall `confidence`, `evidenceIds`,
`sourceArtifacts`, `summary`, `checksum`, `generatedAt`, `formulaVersion`.

## Generation rules

Group + dedup + merge overlapping recommendations by `category | normalized
proposedAction`; union evidence/risks/limitations; take max impact, max effort
(conservative), min candidate confidence, deterministic text from the smallest
candidate id. Every proposal references ≥1 evidence id — a candidate with no
evidence is dropped. Nothing is invented.

## Priority model

Evidence-derived: `score = impact + (linked risks ? 10 : 0)`. Critical ≥ 85,
High ≥ 65, Medium ≥ 40, else Low. Never opinion.

## Effort model

From the evidence-backed effort signal: Small ≤ 33, Medium ≤ 66, Large otherwise;
`unknown` reserved for a missing signal.

## Confidence model

Ceiled by the **minimum** backing-evidence confidence (the candidate's advisory
confidence can only lower it). Conflicting findings (proposal category present in
both strengths and weaknesses) subtract a fixed penalty. Floored at zero, never
inflated. The snapshot confidence is the minimum across proposals.

## Dependencies

A prerequisite shares ≥1 affected dimension AND has strictly lower effort
(foundational work first). A proposal with dependencies has `status = blocked`;
otherwise `ready`. The dependency graph is a valid DAG regardless of display order
(proposals are displayed by priority).

## Failure semantics

No usable candidates → `status = unavailable`, `reason = insufficient_evidence`,
empty proposals, zero confidence, `reviewRequired = false`. The runtime continues;
nothing is fabricated and no stage blocks.

## Report + scanner

The report gains a bounded `proposalIntelligence` section (status, proposal count,
priority-bucket counts, confidence, review required; "Unavailable — insufficient
evidence" when absent). The Prospect Scanner surfaces a read-only status panel —
Available / Unavailable / Review Required, proposal count, and confidence — read
from the persisted snapshot (`proposal` is now a readable artifact kind). No
redesign.

## Determinism & safety (tested)

- No evidence → UNAVAILABLE; single → proposal; multiple → priority-ordered;
  duplicates/overlaps → merged; conflicting findings → confidence reduction;
  priority + effort derive from evidence; prerequisites precede dependents;
  replay → identical checksum.
- Provider-independent: the snapshot is byte-identical with or without a provider
  execution outcome.
- Resume/replay: idempotent persist — no duplicate `proposal` artifact.
- Full runtime discovery → report includes the proposal-intelligence section.
- No internet, no scraping, no model call, no marketing copy, no narrative, no
  hidden reasoning, no provider dependency.

Phase C remains incomplete: the Narrative Engine and the final all-engine
deterministic validation are still deferred.
