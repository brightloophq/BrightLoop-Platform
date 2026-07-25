# Narrative Engine Runtime Integration (Phase C · Sprint C10)

Makes the Narrative Engine a **deterministic PRESENTATION layer**. It transforms
already-computed intelligence (Prospect / Competitor / Proposal / findings) into
structured, client-facing narrative sections using fixed sentence templates. It is
presentation, never reasoning: it never discovers, infers, recommends, predicts,
invents, creates evidence, changes confidence, or calls a provider. When there is
not enough intelligence it emits an explicit UNAVAILABLE snapshot and the runtime
continues.

```
… findings → competitor → proposal → [narrative] → report (consumes the narrative)
```

## Where it runs

The narrative runs as a deterministic step INSIDE `report_assembly`, after the
report's intelligence has been assembled. It reads the report's own projected
presentation fields plus the competitor and proposal snapshots, persists a
first-class `narrative` artifact (already a `runtime_artifact_kind` — **no
migration**), and `report_assembly` then **consumes** that artifact as the report's
`narrative` presentation section. It is deliberately not a new canonical stage —
the 13-stage runtime is unchanged.

## Inputs (presentation only)

- Prospect Intelligence — executive overview, index summary, strengths,
  weaknesses, opportunities, evidence count, confidence.
- Competitor Intelligence snapshot (C8).
- Proposal Intelligence snapshot (C9).
- Validated provider claims — presence-only flag (advisory).
- Evidence lineage (artifact ids).

Nothing else. No external sources, no internet, no provider calls.

## Narrative schema

`narrativeSnapshotSchema` (`@brightloop/schema`), distinct from the Sprint-12
narrative builder. Fixed section spine (`executive_summary`, `current_state`,
`key_opportunities`, `competitive_position`, `recommended_priorities`,
`implementation_considerations`, `evidence_summary`, `review_notes`). Each block:
`id`, `key`, `heading`, `paragraphs`, `supportingEvidenceIds`,
`supportingArtifacts`, `confidence`, `reviewRequired`. Snapshot adds `status`,
`reason`, overall `confidence`, `evidenceIds`, `sourceArtifacts`, `summary`,
`checksum`, `generatedAt`, `formulaVersion`.

## Deterministic template system

Every paragraph is produced by a fixed template filled with structured values
(counts, titles, bands) — no creative writing, no marketing language, no
randomness, no variable phrasing. Lists are joined deterministically. Same inputs
always produce identical narrative. When a source is unavailable the section
states that plainly (e.g. "No verified competitor evidence was available") rather
than inventing content.

## Traceability

Each block carries the `supportingEvidenceIds` and `supportingArtifacts` it was
derived from, a `confidence` **carried verbatim from the source artifact** (the
narrative never computes confidence), and `reviewRequired = true`. The snapshot's
overall confidence is the floor of the sourced sections — a selection, never a
fresh computation. The content checksum excludes volatile artifact ids so it is
addressed on presentation content alone.

## Report integration

`report_assembly` builds the base report, then builds the narrative from that
assembled intelligence, persists it, and sets the report's `narrative` section to
the narrative artifact's sections — so the report's presentation text now comes
from the narrative artifact. The report schema is not redesigned; the section is
additive.

## Scanner integration

The Prospect Scanner surfaces a read-only status panel — Available / Unavailable /
Review Required, confidence, section count — read from the persisted snapshot
(`narrative` is now a readable artifact kind). No redesign.

## Failure semantics

No prospect intelligence to present → `status = unavailable`,
`reason = insufficient_intelligence`, no sections, zero confidence,
`reviewRequired = false`. The runtime continues; nothing is fabricated and no stage
blocks.

## Determinism & safety (tested)

- No intelligence → UNAVAILABLE; a fixed section spine when present; competitor /
  proposal summaries carried with their source confidence; unavailable sources
  stated, never invented; evidence traceability on every block; replay → identical
  checksum.
- Provider-independent: the narrative is byte-identical with or without a provider
  execution outcome (artifact ids are excluded from the checksum).
- Resume/replay: idempotent persist — no duplicate `narrative` artifact.
- Full runtime discovery → report consumes the narrative as its presentation
  section.
- No internet, no network, no AI text generation, no hidden reasoning, no
  unsupported statements — every sentence traces to evidence.

Phase C remains incomplete: the final all-engine deterministic validation is still
deferred.
