# Safe Provider Claim Enrichment (Phase C · Sprint C7)

Lets `provider_execution` contribute **safe, structured, validated claim candidates**
into `grounding_validation` — without persisting or exposing raw provider output,
chain-of-thought, full prompts, or unrestricted model prose. Provider enrichment
is optional; the deterministic provider-disabled path is unchanged.

```
reasoning_jobs → provider_execution → safe claim candidates
  → grounding_validation → validated_claims → optional finding enrichment → report
```

## The leak boundary

`packages/providers/src/anthropic/claim-parser.ts` is the ONLY place raw provider
output is read. It accepts a single allowlisted shape —
`{ claims: [{ category, statement, evidenceIds, confidence }] }` — and copies only:
a bounded normalized `statement` (≤400 chars), an enum `category`, known
`evidenceIds`, and an integer `confidence`. It copies **zero** arbitrary fields.
Everything else is dropped with a safe reason code:

- non-object / missing claims array → no candidates;
- statement over the cap → `statement_too_long` (never truncated-and-kept);
- no / unknown / cross-run evidence → `no_evidence` / `unknown_evidence`;
- duplicate → `duplicate`; count over the cap → `over_limit`.

Raw output exists transiently in memory for parsing only. It is never persisted,
logged, emitted in events, returned through APIs, or placed in a thrown error.

## execution_outcomes

The provider executor adds an `enrichment` section (status, accepted/rejected
counts, safe candidates, safe rejection categories) to the metadata-only
`execution_outcomes` envelope. No raw text. `execution_outcomes` is already a
`runtime_artifact_kind` enum member — **no migration**.

## Grounding

`grounding_validation` reads `enrichment.candidates`, derives each claim's
evidence facts from the bundle (strongest state, freshest band, evidence
confidence as a **ceiling**), caps provider confidence at that ceiling
(provider confidence is advisory only), runs the existing anti-hallucination
guards, and keeps only grounded claims. Provider prose never bypasses grounding.

## Findings & report

Prospect Intelligence remains the deterministic, authoritative finding source;
validated provider claims are optional enrichment and never alter maturity
scores. The report exposes only safe enrichment **metadata** (status, counts,
safe reason codes, `deterministicOnly`). Human review remains mandatory.

## Provider-disabled path

Unchanged: `provider_execution` blocks, grounding yields an empty validated set,
and the deterministic findings + report still complete, with enrichment marked
`unavailable`. No provider artifact is fabricated.

## Safety guarantees (tested)

- No raw provider output in any artifact or event (RAW_SENTINEL asserted absent).
- No chain-of-thought / prompt / arbitrary JSON persisted.
- Confidence never exceeds the backing evidence.
- Deterministic replay: identical fake response → identical safe candidates and
  identical report checksum.
- No live provider or network in tests/CI.

Phase C remains incomplete: Competitor Intelligence, Proposal Intelligence, and
Narrative Engine integrations, plus the final all-engine runtime validation, are
still deferred.
