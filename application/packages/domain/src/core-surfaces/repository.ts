/* =============================================================================
 * CoreSurfaceRepository — the PORT for Business Scan / Domains / Findings.
 * Mirrors the TransformationRepository pattern: a thin, tenant-safe persistence
 * boundary (RLS-scoped adapter runs under the caller's session). It does NOT
 * decide ids, statuses, timestamps, attribution, or capability — that is the
 * CoreSurfaceService's job.
 * ========================================================================== */

import type { BusinessScan, Domain, ScanFinding } from "@brightloop/schema";

export interface CoreSurfaceRepository {
  // ---- Attribution ---------------------------------------------------------
  /**
   * Resolve the internal `public.users.id` for an auth user id (the JWT `sub`
   * that `actor.userId` carries). `created_by` is a FK to `users(id)`, NOT the
   * auth uuid — see conversation/quote actions for the same lookup. Returns null
   * when no internal row exists (attribution is then stored as null).
   */
  resolveUserId(authUserId: string): Promise<string | null>;

  // ---- Business scans ------------------------------------------------------
  createScan(record: BusinessScan): Promise<BusinessScan>;
  getScan(id: string): Promise<BusinessScan | null>;
  latestScan(clientId: string): Promise<BusinessScan | null>;
  setScanStatus(id: string, status: BusinessScan["status"]): Promise<BusinessScan>;

  // ---- Scan findings -------------------------------------------------------
  createFinding(record: ScanFinding): Promise<ScanFinding>;
  listFindings(scanId: string): Promise<ScanFinding[]>;

  // ---- Business domains (System Map nodes) ---------------------------------
  upsertDomain(record: Domain): Promise<Domain>;
  listDomains(clientId: string): Promise<Domain[]>;
  /** All domains the caller may see (RLS-scoped: internal → every org). Console portfolio scope. */
  listAllDomains(): Promise<Domain[]>;
  setDomainStatus(
    clientId: string,
    key: Domain["key"],
    status: Domain["status"],
    currentScore?: number | null,
  ): Promise<Domain>;
}
