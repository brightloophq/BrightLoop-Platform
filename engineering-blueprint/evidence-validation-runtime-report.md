# Evidence Validation Runtime — Trust & Traceability

**Branch:** `feat/evidence-validation-runtime` · **Track:** Business Intelligence Engine (Phase C productization) · additive only.

## The correction that shaped this sprint

The brief asked to "implement the runtime for Stage 4 / 13 · Evidence Validation" because
the UI said *"Evidence validation has no runtime implementation yet."* Reconstructing the
pipeline from the repository showed that premise is **false**, and acting on it literally
would have damaged the architecture:

1. **Stage 4 `evidence_validation` already has a committed runtime executor**
   ([`packages/application/src/pipeline/stage-executors.ts`](../application/packages/application/src/pipeline/stage-executors.ts) → `evidenceValidation`,
   reads `discovery_manifest` → produces the `evidence_bundle`). It is wired into the live
   driver via `createIntelligenceStageRegistry`. `ENGINEERING_CONTEXT.md` §12 was simply
   stale (it stopped at C3; the C6.2–C10 intelligence stages were merged later).
2. **The placeholder text was a stale UI classifier**, not a truthful status:
   [`nextStageView`](../application/apps/web/src/lib/prospect-scanner.ts) only recognised
   the 3 discovery stages and the 1 reasoning stage, and blanket-labelled the **other 9**
   deterministic stages "has no runtime implementation yet." It mis-reported stages that
   actually execute.
3. **The semantics the brief described** — "Claude produced findings; verify them against
   evidence; assign a support level; recompute confidence; only supported ones survive" —
   already exist as **Stage 10 `grounding_validation`**, which runs *after* the provider
   (Stage 9) and *before* findings (Stage 11). Stage 4 runs before Claude and structurally
   cannot verify findings.

The 13-stage canonical order (from
[`pipeline.ts`](../application/packages/schema/src/pipeline.ts)):

```
1 discovery_planning   2 discovery_completion  3 evidence_normalization
4 evidence_validation  5 graph_assembly        6 graph_snapshot
7 reasoning_job_creation 8 provider_routing     9 provider_execution ← Claude
10 grounding_validation  11 finding_synthesis   12 recommendation_candidates
13 report_assembly
```

Rather than build a duplicate Stage 4, this sprint delivered the three things the request
was actually reaching for, at the correct layers.

## What was built

### 1 · Support taxonomy at Stage 10 (runtime logic)

- **New pure domain classifier** `classifyClaimSupport`
  ([`packages/domain/src/scan-engine/reasoning/support.ts`](../application/packages/domain/src/scan-engine/reasoning/support.ts)) —
  the graded sibling of the binary `grounding.ts`. Given a claim's cited evidence facts +
  its grounding rejections, it returns one of **SUPPORTED / PARTIALLY_SUPPORTED /
  WEAK_SUPPORT / UNSUPPORTED / CONTRADICTED** plus a **confidence recalculated from
  evidence quality** (state ceiling × freshness × source coverage) and stable reason codes.
  Confidence is only ever *lowered* relative to the provider's advisory value, never raised;
  no evidence or an over-assertion resolves to 0; a source the record marks unavailable, or a
  bundle conflict, resolves to CONTRADICTED. Deterministic, Node-free, no clock.
- **Schema:** `evidenceSupportLevelSchema` / `evidenceSupportAssessmentSchema` +
  `SURVIVING_EVIDENCE_SUPPORT_LEVELS` in `schema/reasoning.ts` (prefixed to avoid the
  existing `proposal.ts` support-tier symbol).
- **`grounding_validation` executor** now grades every claim, attaches
  `supportLevel` / `recomputedConfidence` / `reasonCodes` / `survives` to each grounded and
  rejected claim, and adds a `support` summary (per-level counts, `surviving`,
  `averageConfidence`) to the `validated_claims` envelope. The summary is also threaded into
  the report's `providerEnrichment` section. A claim survives **iff grounding passed** — the
  support level is descriptive and can never promote a rejected claim.

### 2 · Fixed the stale UI classifier

- `nextStageView` now recognises the 9 deterministic intelligence stages
  (`INTELLIGENCE_STAGES`) and reports them **supported** — they execute through the
  intelligence registry with no crawler/provider and no credit. The misleading "no runtime
  implementation yet" placeholder disappears because the classifier now reflects reality;
  the genuinely-unknown-stage fallback is retained.

### 3 · Evidence-validation traceability UI

- **Safe projecting use-case** `getScanEvidenceValidation`
  ([`packages/application/src/scan/evidence-validation.ts`](../application/packages/application/src/scan/evidence-validation.ts)) —
  `validated_claims` is deliberately **not** in the raw readable-artifact allowlist because
  its envelope can carry model-shaped text, so this use-case is the sanctioned gate: it
  returns a bounded, explicit-pick `EvidenceValidationDTO` (never the raw envelope), passes
  every string through a tag/control-stripping `safeText`, and **never surfaces a rejected
  (ungrounded) claim's statement** — only its level, evidence ids and reason codes. It also
  projects a bounded id→origin evidence index from the `evidence_bundle` for the drill-down.
- **Pure web view builder** `buildEvidenceValidationView` joins each conclusion's evidence
  ids → source page URL + extracted snippet (from the discovery view), and renders a
  plain-language confidence explanation from the reason codes.
- **`EvidenceValidationPanel`** — validation progress, evidence count, supported / rejected
  counts, average confidence, contradiction alert, and per-conclusion **native
  `<details>` drill-down**: Conclusion → support level + confidence explanation → each
  evidence item (state badge, link to the original page, extracted snippet). Server-rendered,
  keyboard-operable, token-only, theme-aware.

## Tests (all green; ZERO provider/network/credit)

- Domain: `support.test.ts` (+15) — the classifier truth table (negative outcomes, graded
  support, confidence recalculation, soft-defect cap, determinism).
- Application: `evidence-validation.test.ts` (+6) — the projection's safety (no rejected
  prose, tag stripping, evidence-index join, taxonomy projection); `reasoning-spine.test.ts`
  extended to assert per-claim support fields + the `support` summary.
- Web: `prospect-scanner.test.ts` extended (+ blocks) — the traceability join, support
  labelling, reason explanation, deterministic-only summary; the stale-classifier test
  corrected to assert intelligence stages are supported.

**Gate:** `pnpm turbo run typecheck lint test build` → **36/36 successful**. Additive only:
no migration, RLS, generated-type, or capability change; no new provider call; live AI stays
disabled by default.

## Outcome

> **Every AI conclusion in Auxion can now be traced back to verifiable evidence collected
> from the client's website** — each finding and each validated provider claim carries a
> support level, a confidence recalculated from evidence quality, and an expandable trail to
> the exact source page and snippet behind it. Unsupported and contradicted claims are named
> and do not carry forward.
