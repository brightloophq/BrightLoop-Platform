/* =============================================================================
 * Supabase Platform Certification repositories (Phase E · Sprint E8).
 * The run is versioned (optimistic concurrency); results/issues/exceptions are
 * append-only. Untyped-cast pattern; mappers are the boundary.
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  err, mapDatabaseError, ok,
  type CertificationExceptionRepository, type CertificationIssueRepository, type CertificationResultRepository,
  type CertificationRunRepository,
} from "@brightloop/domain";
import type { CertificationException, CertificationIssue, CertificationResult, CertificationRun } from "@brightloop/schema";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import * as m from "./mappers.js";

export class SupabaseCertificationRunRepository implements CertificationRunRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(r: CertificationRun) { const { data, error } = await this.db.from("certification_run").insert(m.runRow(r)).select("*").single(); if (error) return mapDatabaseError(error, "certificationRun.create"); return ok("created", m.toRun(data as Record<string, unknown>)); }
  async getById(id: string) { const { data, error } = await this.db.from("certification_run").select("*").eq("id", id).maybeSingle(); if (error) return mapDatabaseError(error, "certificationRun.getById"); return ok("found", data ? m.toRun(data as Record<string, unknown>) : null); }
  async listByWorkspace(w: string) { const { data, error } = await this.db.from("certification_run").select("*").eq("workspace_id", w).order("created_at", { ascending: false }); if (error) return mapDatabaseError(error, "certificationRun.list"); return ok("found", (data ?? []).map((r) => m.toRun(r as Record<string, unknown>))); }
  async save(next: CertificationRun, expected: number) { const { data, error } = await this.db.from("certification_run").update({ status: next.status, outcome: next.outcome, published: next.published, score: next.score, total_checks: next.totalChecks, passed_checks: next.passedChecks, failed_checks: next.failedChecks, warning_count: next.warningCount, categories_covered: next.categoriesCovered, duration_ms: next.durationMs, version: next.version, updated_at: next.updatedAt }).eq("id", next.id).eq("version", expected).select("*").maybeSingle(); if (error) return mapDatabaseError(error, "certificationRun.save"); if (data === null) return err("conflict", "certificationRun.save: version mismatch"); return ok("updated", m.toRun(data as Record<string, unknown>)); }
}

export class SupabaseCertificationResultRepository implements CertificationResultRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async appendMany(rows: readonly CertificationResult[]) { if (rows.length === 0) return ok("created", [] as CertificationResult[]); const { data, error } = await this.db.from("certification_result").insert(rows.map(m.resultRow)).select("*"); if (error) return mapDatabaseError(error, "certificationResult.appendMany"); return ok("created", (data ?? []).map((r) => m.toResult(r as Record<string, unknown>))); }
  async listByRun(id: string) { const { data, error } = await this.db.from("certification_result").select("*").eq("run_id", id).order("created_at", { ascending: true }); if (error) return mapDatabaseError(error, "certificationResult.listByRun"); return ok("found", (data ?? []).map((r) => m.toResult(r as Record<string, unknown>))); }
}

export class SupabaseCertificationIssueRepository implements CertificationIssueRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async appendMany(rows: readonly CertificationIssue[]) { if (rows.length === 0) return ok("created", [] as CertificationIssue[]); const { data, error } = await this.db.from("certification_issue").insert(rows.map(m.issueRow)).select("*"); if (error) return mapDatabaseError(error, "certificationIssue.appendMany"); return ok("created", (data ?? []).map((r) => m.toIssue(r as Record<string, unknown>))); }
  async listByRun(id: string) { const { data, error } = await this.db.from("certification_issue").select("*").eq("run_id", id); if (error) return mapDatabaseError(error, "certificationIssue.listByRun"); return ok("found", (data ?? []).map((r) => m.toIssue(r as Record<string, unknown>))); }
}

export class SupabaseCertificationExceptionRepository implements CertificationExceptionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(e: CertificationException) { const { data, error } = await this.db.from("certification_exception").insert(m.exceptionRow(e)).select("*").single(); if (error) return mapDatabaseError(error, "certificationException.append"); return ok("created", m.toException(data as Record<string, unknown>)); }
  async listByRun(id: string) { const { data, error } = await this.db.from("certification_exception").select("*").eq("run_id", id).order("created_at", { ascending: false }); if (error) return mapDatabaseError(error, "certificationException.listByRun"); return ok("found", (data ?? []).map((r) => m.toException(r as Record<string, unknown>))); }
}
