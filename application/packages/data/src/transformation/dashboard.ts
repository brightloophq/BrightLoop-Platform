/* =============================================================================
 * Transformation dashboard — Supabase read adapter (Sprint 4).
 *
 * Produces the raw DashboardSnapshot the domain read model shapes into the view.
 * Unlike the write adapter (repository.ts), this reader is FULLY TYPED against the
 * generated Database types — reads never hit the enum-status impedance mismatch,
 * so there is no untyped cast and no `any` here.
 *
 * ██ RLS IS THE BOUNDARY ██
 *   The injected client is request-scoped and carries the caller's session. For
 *   internal roles RLS exposes every org's transformation rows (portfolio view);
 *   for a client role it exposes only their own. This adapter adds the org filter
 *   for a client scope as defence-in-depth, but never widens what RLS permits.
 *   Never cache this instance across requests.
 * ========================================================================== */

import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import {
  tallyByKey,
  countStaleRecommendations,
  countCriticalOpenRisks,
  type DashboardScope,
  type DashboardSnapshot,
  type DashboardActivity,
} from "@brightloop/domain";

/** How many audit rows to pull before the view caps the feed. */
const ACTIVITY_FETCH = 20;
/** Defensive bound on portfolio snapshot scans. */
const PORTFOLIO_SCAN_LIMIT = 2000;

export class SupabaseTransformationDashboardRepository {
  constructor(private readonly db: AuxionSupabaseClient) {}

  private fail(op: string, message: string): never {
    throw new Error(`dashboard.${op} failed: ${message}`);
  }

  /** Apply the org filter for a client scope; portfolio scope reads everything RLS allows. */
  private isOrg(scope: DashboardScope): scope is { kind: "organization"; clientId: string } {
    return scope.kind === "organization";
  }

  async read(scope: DashboardScope): Promise<DashboardSnapshot> {
    const [
      signals,
      insights,
      recommendationRows,
      approvals,
      moves,
      executions,
      riskRows,
      measurements,
      learnings,
      knowledge,
      health,
      index,
      activity,
    ] = await Promise.all([
      this.statusCounts("signals", scope),
      this.statusCounts("insights", scope),
      this.recommendationRows(scope),
      this.approvalCounts(scope),
      this.statusCounts("moves", scope),
      this.statusCounts("execution_records", scope),
      this.riskRows(scope),
      this.total("measurements", scope),
      this.total("learnings", scope),
      this.total("knowledge_assets", scope),
      this.healthSnapshot(scope),
      this.indexSnapshot(scope),
      this.recentActivity(),
    ]);

    return {
      businessHealth: health.snapshot,
      transformationIndex: index,
      orgsTracked: health.orgsTracked,
      signals,
      insights,
      recommendations: recommendationRows.counts,
      recommendationsStale: recommendationRows.stale,
      approvals,
      moves,
      executions,
      measurements,
      learnings,
      risks: riskRows,
      knowledge,
      activity,
    };
  }

  /* ---- per-entity readers ------------------------------------------------- */

  private async statusCounts(
    table: "signals" | "insights" | "moves" | "execution_records",
    scope: DashboardScope,
  ): Promise<Record<string, number>> {
    let q = this.db.from(table).select("status");
    if (this.isOrg(scope)) q = q.eq("client_id", scope.clientId);
    const { data, error } = await q;
    if (error) this.fail(table, error.message);
    return tallyByKey(data ?? [], "status");
  }

  private async approvalCounts(scope: DashboardScope): Promise<Record<string, number>> {
    let q = this.db.from("approvals").select("decision");
    if (this.isOrg(scope)) q = q.eq("client_id", scope.clientId);
    const { data, error } = await q;
    if (error) this.fail("approvals", error.message);
    return tallyByKey(data ?? [], "decision");
  }

  private async recommendationRows(
    scope: DashboardScope,
  ): Promise<{ counts: Record<string, number>; stale: number }> {
    let q = this.db.from("recommendations").select("status, created_at");
    if (this.isOrg(scope)) q = q.eq("client_id", scope.clientId);
    const { data, error } = await q;
    if (error) this.fail("recommendations", error.message);
    const rows = data ?? [];
    return {
      counts: tallyByKey(rows, "status"),
      stale: countStaleRecommendations(
        rows.map((r) => ({ status: r.status, createdAt: r.created_at })),
        Date.now(),
      ),
    };
  }

  private async riskRows(scope: DashboardScope): Promise<{ total: number; criticalOpen: number }> {
    let q = this.db.from("operational_risks").select("severity, status");
    if (this.isOrg(scope)) q = q.eq("client_id", scope.clientId);
    const { data, error } = await q;
    if (error) this.fail("operational_risks", error.message);
    const rows = data ?? [];
    return { total: rows.length, criticalOpen: countCriticalOpenRisks(rows) };
  }

  private async total(
    table: "measurements" | "learnings" | "knowledge_assets",
    scope: DashboardScope,
  ): Promise<number> {
    let q = this.db.from(table).select("*", { count: "exact", head: true });
    if (this.isOrg(scope)) q = q.eq("client_id", scope.clientId);
    const { count, error } = await q;
    if (error) this.fail(table, error.message);
    return count ?? 0;
  }

  private async healthSnapshot(
    scope: DashboardScope,
  ): Promise<{ snapshot: { score: number } | null; orgsTracked: number | null }> {
    if (this.isOrg(scope)) {
      const { data, error } = await this.db
        .from("business_health")
        .select("score")
        .eq("client_id", scope.clientId)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) this.fail("business_health", error.message);
      return { snapshot: data ? { score: Math.round(data.score) } : null, orgsTracked: null };
    }
    // Portfolio: average the LATEST score per organization.
    const { data, error } = await this.db
      .from("business_health")
      .select("client_id, score, captured_at")
      .order("captured_at", { ascending: false })
      .limit(PORTFOLIO_SCAN_LIMIT);
    if (error) this.fail("business_health", error.message);
    const latest = new Map<string, number>();
    for (const row of data ?? []) if (!latest.has(row.client_id)) latest.set(row.client_id, row.score);
    const orgsTracked = latest.size;
    if (orgsTracked === 0) return { snapshot: null, orgsTracked: 0 };
    const avg = [...latest.values()].reduce((a, b) => a + b, 0) / orgsTracked;
    return { snapshot: { score: Math.round(avg) }, orgsTracked };
  }

  private async indexSnapshot(
    scope: DashboardScope,
  ): Promise<{ value: number; delta: number | null } | null> {
    if (this.isOrg(scope)) {
      const { data, error } = await this.db
        .from("transformation_index")
        .select("value, delta")
        .eq("client_id", scope.clientId)
        .order("at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) this.fail("transformation_index", error.message);
      return data ? { value: Math.round(data.value), delta: data.delta } : null;
    }
    const { data, error } = await this.db
      .from("transformation_index")
      .select("client_id, value, at")
      .order("at", { ascending: false })
      .limit(PORTFOLIO_SCAN_LIMIT);
    if (error) this.fail("transformation_index", error.message);
    const latest = new Map<string, number>();
    for (const row of data ?? []) if (!latest.has(row.client_id)) latest.set(row.client_id, row.value);
    if (latest.size === 0) return null;
    const avg = [...latest.values()].reduce((a, b) => a + b, 0) / latest.size;
    return { value: Math.round(avg), delta: null }; // portfolio delta is not meaningful
  }

  private async recentActivity(): Promise<DashboardActivity[]> {
    // transition_log is internal-only by RLS (and carries no client_id), so a
    // client scope legitimately gets an empty feed rather than cross-org rows.
    const { data, error } = await this.db
      .from("transition_log")
      .select("id, machine, entity_id, from_state, to_state, actor_id, at")
      .order("at", { ascending: false })
      .limit(ACTIVITY_FETCH);
    if (error) this.fail("transition_log", error.message);
    const rows = data ?? [];

    // Resolve actor display names in one query.
    const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((v): v is string => Boolean(v)))];
    const names = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: users } = await this.db.from("users").select("id, name").in("id", actorIds);
      for (const u of users ?? []) names.set(u.id, u.name);
    }

    return rows.map((r) => ({
      id: String(r.id),
      entity: r.machine,
      entityId: r.entity_id,
      from: r.from_state,
      to: r.to_state,
      actor: r.actor_id ? (names.get(r.actor_id) ?? r.actor_id) : null,
      at: r.at,
    }));
  }
}
