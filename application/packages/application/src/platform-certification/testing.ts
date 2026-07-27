/* =============================================================================
 * In-memory Certification repositories (Phase E · Sprint E8) — TEST SUPPORT.
 * The run is versioned; results/issues/exceptions are append-only.
 * ========================================================================== */

import { ok, type CertificationRepositories, type RuntimeResult } from "@brightloop/domain";
import type { CertificationException, CertificationIssue, CertificationResult, CertificationRun } from "@brightloop/schema";

const conflict = (): RuntimeResult<never> => ({ ok: false, code: "conflict", message: "version mismatch", detail: null });

export function createInMemoryCertificationRepos(): CertificationRepositories {
  const runs = new Map<string, CertificationRun>();
  const results: CertificationResult[] = [];
  const issues: CertificationIssue[] = [];
  const exceptions: CertificationException[] = [];
  return {
    runs: {
      create: async (r) => { runs.set(r.id, r); return ok("created", r); },
      getById: async (id) => ok("found", runs.get(id) ?? null),
      listByWorkspace: async (w) => ok("found", [...runs.values()].filter((r) => r.workspaceId === w)),
      save: async (next, expected) => { const cur = runs.get(next.id); if (!cur || cur.version !== expected) return conflict(); runs.set(next.id, next); return ok("updated", next); },
    },
    results: { appendMany: async (r) => { results.push(...r); return ok("created", [...r]); }, listByRun: async (id) => ok("found", results.filter((x) => x.runId === id)) },
    issues: { appendMany: async (r) => { issues.push(...r); return ok("created", [...r]); }, listByRun: async (id) => ok("found", issues.filter((x) => x.runId === id)) },
    exceptions: { append: async (e) => { exceptions.push(e); return ok("created", e); }, listByRun: async (id) => ok("found", exceptions.filter((x) => x.runId === id)) },
  };
}
