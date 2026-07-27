/* =============================================================================
 * Platform Certification — REPOSITORY PORTS (Phase E · Sprint E8).
 *
 * The run is versioned (optimistic concurrency); results / issues / exceptions
 * are append-only. RLS is the tenant boundary.
 * ========================================================================== */

import type { CertificationException, CertificationIssue, CertificationResult, CertificationRun } from "@brightloop/schema";
import type { RuntimeResult } from "../runtime/results.js";

export interface CertificationRunRepository {
  create(row: CertificationRun): Promise<RuntimeResult<CertificationRun>>;
  getById(id: string): Promise<RuntimeResult<CertificationRun | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<CertificationRun[]>>;
  save(next: CertificationRun, expectedVersion: number): Promise<RuntimeResult<CertificationRun>>;
}
export interface CertificationResultRepository {
  appendMany(rows: readonly CertificationResult[]): Promise<RuntimeResult<CertificationResult[]>>;
  listByRun(runId: string): Promise<RuntimeResult<CertificationResult[]>>;
}
export interface CertificationIssueRepository {
  appendMany(rows: readonly CertificationIssue[]): Promise<RuntimeResult<CertificationIssue[]>>;
  listByRun(runId: string): Promise<RuntimeResult<CertificationIssue[]>>;
}
export interface CertificationExceptionRepository {
  append(row: CertificationException): Promise<RuntimeResult<CertificationException>>;
  listByRun(runId: string): Promise<RuntimeResult<CertificationException[]>>;
}

export interface CertificationRepositories {
  runs: CertificationRunRepository;
  results: CertificationResultRepository;
  issues: CertificationIssueRepository;
  exceptions: CertificationExceptionRepository;
}
