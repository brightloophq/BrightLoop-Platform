/* =============================================================================
 * Structured-output validation (Sprint 7 §5 · AIS-001 §12 Validator) — PURE.
 *
 * The gate between an untrusted provider response and a completed reasoning output.
 * Parses against the requested schema, then runs the Sprint-6 grounding guards
 * (evidence, confidence ceiling, citations, unavailable sources, fabricated
 * competitors/metrics, required limitations). ANY rejection ⇒ `rejected`; invalid
 * output is NEVER promoted to a completed result.
 * ========================================================================== */

import type { EvidenceCitation, GroundingRejection, ValidationResult } from "@brightloop/schema";
import { validateGrounding, type GroundingClaim, type GroundingContext } from "../reasoning/grounding.js";

/** What a caller-supplied parser extracts from a provider's raw structured output. */
export interface ParsedProviderOutput {
  claims: GroundingClaim[];
  citations: EvidenceCitation[];
}

export interface OutputValidation {
  status: "succeeded" | "rejected";
  validation: ValidationResult;
  citations: EvidenceCitation[];
  groundingRejections: GroundingRejection[];
}

export interface ValidateOutputOptions {
  groundingContext: GroundingContext;
  /** Parses + shape-validates the raw output, extracting claims + citations. Throws when malformed. */
  parse: (raw: unknown) => ParsedProviderOutput;
}

/**
 * Validate a provider's raw output. A schema-parse failure is a `malformed_output`
 * rejection; otherwise every extracted claim is run through the grounding guards.
 * Deterministic. The returned `citations` are empty on malformed output.
 */
export function validateExecutionOutput(rawOutput: unknown, opts: ValidateOutputOptions): OutputValidation {
  let parsed: ParsedProviderOutput;
  try {
    parsed = opts.parse(rawOutput);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unparseable provider output";
    return {
      status: "rejected",
      validation: { passed: false, rejections: [{ reason: "malformed_output", claimId: null, detail }] },
      citations: [],
      groundingRejections: [],
    };
  }

  const groundingRejections: GroundingRejection[] = [];
  for (const claim of parsed.claims) groundingRejections.push(...validateGrounding(claim, opts.groundingContext));

  const passed = groundingRejections.length === 0;
  return {
    status: passed ? "succeeded" : "rejected",
    validation: {
      passed,
      rejections: groundingRejections.map((r) => ({ reason: r.reason, claimId: r.claimId, detail: r.detail })),
    },
    citations: parsed.citations,
    groundingRejections,
  };
}
