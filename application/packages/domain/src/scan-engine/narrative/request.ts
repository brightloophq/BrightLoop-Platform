/* =============================================================================
 * Narrative request (Sprint 12 §1) — PURE.
 *
 * The intake for a narrative build. Defaults are taken from the AUDIENCE POLICY,
 * so an under-specified request still lands on safe, deterministic settings —
 * never on the most permissive ones.
 * ========================================================================== */

import { narrativeRequestSchema, type NarrativeAudience, type NarrativePurpose, type NarrativeRequest } from "@brightloop/schema";
import { audiencePolicy } from "./policy.js";

export interface NewNarrativeRequestInput {
  id: string;
  scanId: string;
  clientId: string | null;
  audience: NarrativeAudience;
  purpose: NarrativePurpose;
  sourceArtifactIds?: string[];
  requestedSections?: string[];
  toneProfile?: NarrativeRequest["toneProfile"];
  detailLevel?: NarrativeRequest["detailLevel"];
  readingLevel?: NarrativeRequest["readingLevel"];
  maxLength?: number | null;
  citationPolicy?: NarrativeRequest["citationPolicy"];
  claimPolicy?: NarrativeRequest["claimPolicy"];
  confidentialityLevel?: NarrativeRequest["confidentialityLevel"];
  allowedTerminology?: string[];
  prohibitedTerminology?: string[];
  locale?: string;
  brandProfileRef?: string | null;
  createdAt: string;
}

/** Confidentiality ceiling implied by each audience. */
const AUDIENCE_CONFIDENTIALITY: Record<NarrativeAudience, NarrativeRequest["confidentialityLevel"]> = {
  internal_operator: "internal",
  executive: "internal",
  client: "client",
  board: "client",
  prospect: "prospect",
  public_visitor: "public",
};

/** Build a validated request, defaulting from the audience policy. Pure. */
export function newNarrativeRequest(input: NewNarrativeRequestInput): NarrativeRequest {
  const policy = audiencePolicy(input.audience);
  return narrativeRequestSchema.parse({
    id: input.id,
    scanId: input.scanId,
    clientId: input.clientId,
    audience: input.audience,
    purpose: input.purpose,
    sourceArtifactIds: input.sourceArtifactIds ?? [],
    requestedSections: input.requestedSections ?? [],
    toneProfile: input.toneProfile ?? policy.toneProfile,
    detailLevel: input.detailLevel ?? policy.detailLevel,
    readingLevel: input.readingLevel ?? "professional",
    maxLength: input.maxLength ?? null,
    citationPolicy: input.citationPolicy ?? policy.citationPolicy,
    claimPolicy: input.claimPolicy ?? policy.claimPolicy,
    confidentialityLevel: input.confidentialityLevel ?? AUDIENCE_CONFIDENTIALITY[input.audience],
    allowedTerminology: input.allowedTerminology ?? [],
    prohibitedTerminology: input.prohibitedTerminology ?? [],
    locale: input.locale ?? "en-US",
    brandProfileRef: input.brandProfileRef ?? null,
    createdAt: input.createdAt,
  });
}

/**
 * Structural validity: a narrative may not be produced from nothing, and the
 * request may not ask for a confidentiality level above what its audience allows.
 */
export function validateNarrativeRequest(request: NarrativeRequest): string[] {
  const problems: string[] = [];
  if (request.sourceArtifactIds.length === 0) problems.push("no source artifacts referenced — narrative would be untraceable");

  const ceiling = AUDIENCE_CONFIDENTIALITY[request.audience];
  const order: NarrativeRequest["confidentialityLevel"][] = ["public", "prospect", "client", "internal", "restricted"];
  if (order.indexOf(request.confidentialityLevel) > order.indexOf(ceiling)) {
    problems.push(`confidentiality '${request.confidentialityLevel}' exceeds the ceiling '${ceiling}' for audience '${request.audience}'`);
  }

  const policy = audiencePolicy(request.audience);
  for (const section of request.requestedSections) {
    if (!policy.allowedSections.includes(section as never) && section !== "public_preview") {
      problems.push(`section '${section}' is not permitted for audience '${request.audience}'`);
    }
  }
  return problems;
}
