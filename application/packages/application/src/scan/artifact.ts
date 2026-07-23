/* =============================================================================
 * Use-case: read one structured artifact of a scan (Phase C · Sprint C4).
 *
 * The smallest read the internal Prospect Scanner needs that C1 did not already
 * expose: the discovery manifest and the evidence ingress the C3 crawler
 * produces. Returns the latest artifact of a kind as structured JSON, or `null`
 * when the pipeline has not produced it yet — an absent artifact is a legitimate
 * empty state for an operator, not an error.
 *
 * Only an ALLOWLIST of kinds is readable. Intermediate reasoning artifacts that
 * could carry model-shaped content (`reasoning_jobs`, `validated_claims`) are not
 * exposed here; the report/proposal/narrative use-cases remain the gate for
 * anything downstream of the provider.
 * ========================================================================== */

import type { RuntimeArtifactKind } from "@brightloop/schema";
import type { AppContext } from "../context.js";
import { SCAN_READ_CAP } from "../context.js";
import type { ArtifactDTO } from "../dto.js";
import { toArtifactDTO } from "../dto.js";
import { ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { loadAuthorizedRun } from "./shared.js";

/**
 * Artifact kinds an internal operator may read directly. Deliberately narrow:
 * crawl/evidence provenance plus the deterministic post-reasoning ledgers whose
 * envelopes are already structured, validated output — never a raw provider
 * response (which the runtime cannot store by construction).
 */
export const READABLE_ARTIFACT_KINDS = [
  "discovery_manifest",
  "evidence_ingress",
  "evidence_bundle",
  "execution_outcomes",
  "findings",
  "recommendation_candidates",
] as const satisfies readonly RuntimeArtifactKind[];

export type ReadableArtifactKind = (typeof READABLE_ARTIFACT_KINDS)[number];

export function isReadableArtifactKind(value: unknown): value is ReadableArtifactKind {
  return typeof value === "string" && (READABLE_ARTIFACT_KINDS as readonly string[]).includes(value);
}

/** Validate a raw artifact-kind input into an allowlisted kind. */
export function parseArtifactKind(raw: unknown): ReadableArtifactKind {
  if (!isReadableArtifactKind(raw)) {
    throw new ValidationError("Unsupported artifact kind", { kind: `must be one of: ${READABLE_ARTIFACT_KINDS.join(", ")}` });
  }
  return raw;
}

/**
 * The latest artifact of `kind` for a scan, or `null` when it does not exist yet.
 * Authorization is enforced against the LOADED run's tenant, exactly as every
 * other scan read.
 */
export async function getScanArtifact(ctx: AppContext, rawRunId: unknown, rawKind: unknown): Promise<ArtifactDTO | null> {
  const kind = parseArtifactKind(rawKind);
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_READ_CAP);

  const latest = unwrap(await ctx.services.artifacts.latest(run.id, kind));
  return latest === null ? null : toArtifactDTO(latest);
}
