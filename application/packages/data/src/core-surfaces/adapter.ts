/* =============================================================================
 * Core surfaces — Supabase adapter (Phase 1B). Implements CoreSurfaceRepository,
 * FULLY TYPED against the generated Database types (no cast, no `any`). The
 * domains.ts contracts use z.enum (literal unions) that match the generated
 * pg enums exactly, so statuses/keys need no coercion. Internal-only RLS is the
 * real boundary; this request-scoped client carries the caller's session.
 * ========================================================================== */

import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import type { BusinessScan, Domain, ScanFinding } from "@brightloop/schema";
import type { CoreSurfaceRepository } from "@brightloop/domain";

const SCAN_COLS = "id, client_id, status, baseline_index, target_index, created_by, created_at";
const DOMAIN_COLS = "id, client_id, key, status, baseline_score, current_score, created_at";
const FINDING_COLS = "id, scan_id, client_id, domain_key, finding, baseline, priority, created_at";

type ScanRow = {
  id: string; client_id: string; status: BusinessScan["status"]; baseline_index: number;
  target_index: number; created_by: string | null; created_at: string;
};
type DomainRow = {
  id: string; client_id: string; key: Domain["key"]; status: Domain["status"];
  baseline_score: number | null; current_score: number | null; created_at: string;
};
type FindingRow = {
  id: string; scan_id: string; client_id: string; domain_key: ScanFinding["domainKey"];
  finding: string; baseline: string | null; priority: ScanFinding["priority"]; created_at: string;
};

const toScan = (r: ScanRow): BusinessScan => ({
  id: r.id, clientId: r.client_id, status: r.status, baselineIndex: r.baseline_index,
  targetIndex: r.target_index, createdBy: r.created_by, createdAt: r.created_at,
});
const toDomain = (r: DomainRow): Domain => ({
  id: r.id, clientId: r.client_id, key: r.key, status: r.status,
  baselineScore: r.baseline_score, currentScore: r.current_score, createdAt: r.created_at,
});
const toFinding = (r: FindingRow): ScanFinding => ({
  id: r.id, scanId: r.scan_id, clientId: r.client_id, domainKey: r.domain_key,
  finding: r.finding, baseline: r.baseline, priority: r.priority, createdAt: r.created_at,
});

export class SupabaseCoreSurfaceRepository implements CoreSurfaceRepository {
  constructor(private readonly db: AuxionSupabaseClient) {}

  private fail(op: string, message: string): never {
    throw new Error(`core-surfaces.${op} failed: ${message}`);
  }

  async createScan(record: BusinessScan): Promise<BusinessScan> {
    const { data, error } = await this.db
      .from("business_scans")
      .insert({
        id: record.id, client_id: record.clientId, status: record.status,
        baseline_index: record.baselineIndex, target_index: record.targetIndex, created_by: record.createdBy,
      })
      .select(SCAN_COLS)
      .single();
    if (error) this.fail("createScan", error.message);
    return toScan(data);
  }

  async getScan(id: string): Promise<BusinessScan | null> {
    const { data, error } = await this.db.from("business_scans").select(SCAN_COLS).eq("id", id).maybeSingle();
    if (error) this.fail("getScan", error.message);
    return data ? toScan(data) : null;
  }

  async latestScan(clientId: string): Promise<BusinessScan | null> {
    const { data, error } = await this.db
      .from("business_scans").select(SCAN_COLS).eq("client_id", clientId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) this.fail("latestScan", error.message);
    return data ? toScan(data) : null;
  }

  async setScanStatus(id: string, status: BusinessScan["status"]): Promise<BusinessScan> {
    const { data, error } = await this.db.from("business_scans").update({ status }).eq("id", id).select(SCAN_COLS).single();
    if (error) this.fail("setScanStatus", error.message);
    return toScan(data);
  }

  async createFinding(record: ScanFinding): Promise<ScanFinding> {
    const { data, error } = await this.db
      .from("scan_findings")
      .insert({
        id: record.id, scan_id: record.scanId, client_id: record.clientId, domain_key: record.domainKey,
        finding: record.finding, baseline: record.baseline, priority: record.priority,
      })
      .select(FINDING_COLS)
      .single();
    if (error) this.fail("createFinding", error.message);
    return toFinding(data);
  }

  async listFindings(scanId: string): Promise<ScanFinding[]> {
    const { data, error } = await this.db.from("scan_findings").select(FINDING_COLS).eq("scan_id", scanId).limit(200);
    if (error) this.fail("listFindings", error.message);
    return (data ?? []).map(toFinding);
  }

  async upsertDomain(record: Domain): Promise<Domain> {
    const { data, error } = await this.db
      .from("business_domains")
      .upsert(
        {
          id: record.id, client_id: record.clientId, key: record.key, status: record.status,
          baseline_score: record.baselineScore, current_score: record.currentScore,
        },
        { onConflict: "client_id,key" },
      )
      .select(DOMAIN_COLS)
      .single();
    if (error) this.fail("upsertDomain", error.message);
    return toDomain(data);
  }

  async listDomains(clientId: string): Promise<Domain[]> {
    const { data, error } = await this.db.from("business_domains").select(DOMAIN_COLS).eq("client_id", clientId).limit(50);
    if (error) this.fail("listDomains", error.message);
    return (data ?? []).map(toDomain);
  }

  async listAllDomains(): Promise<Domain[]> {
    const { data, error } = await this.db.from("business_domains").select(DOMAIN_COLS).limit(2000);
    if (error) this.fail("listAllDomains", error.message);
    return (data ?? []).map(toDomain);
  }

  async setDomainStatus(
    clientId: string, key: Domain["key"], status: Domain["status"], currentScore?: number | null,
  ): Promise<Domain> {
    const patch: { status: Domain["status"]; current_score?: number | null } = { status };
    if (currentScore !== undefined) patch.current_score = currentScore;
    const { data, error } = await this.db
      .from("business_domains").update(patch).eq("client_id", clientId).eq("key", key).select(DOMAIN_COLS).single();
    if (error) this.fail("setDomainStatus", error.message);
    return toDomain(data);
  }
}
