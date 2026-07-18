/* =============================================================================
 * Insights — Supabase READ adapter (Sprint 6).
 *
 * Fully typed against the generated Database types (no untyped cast, no `any`).
 * Reads are bounded (range + exact count), select only needed columns, and sort
 * on real columns. Enrichment (org names, actor names, parent-signal titles) is
 * done with a few `.in()` lookups — never N+1. WRITES do NOT live here: they flow
 * through the TransformationService so lifecycle guards + audit + events apply.
 *
 * RLS is the real boundary — insights are internal-only, and the request-scoped
 * client carries the caller's session, so this adapter cannot widen what the
 * caller may see. The optional org filter is defence-in-depth, never a bypass.
 * ========================================================================== */

import type { Database } from "@brightloop/db";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import {
  INSIGHT_PAGE_SIZE,
  INSIGHT_RECENT_DAYS,
  type InsightListQuery,
  type InsightListData,
  type InsightDetailData,
  type InsightSummary,
  type InsightTransition,
} from "@brightloop/domain";
import { toInsight } from "./mappers.js";

type InsightStatusEnum = Database["public"]["Enums"]["insight_status"];

/** A signal offered as a link target when authoring an insight. */
export interface LinkableSignal {
  id: string;
  title: string;
  status: string;
  clientId: string;
  orgName: string;
}

/** The parent signal an insight derives from (for tenant derivation + evidence view). */
export interface SignalRef {
  id: string;
  clientId: string;
  title: string;
  status: string;
}

const LIST_COLUMNS = "id, client_id, signal_id, summary, status, confidence, created_by, created_at";
const DETAIL_COLUMNS =
  "id, client_id, signal_id, summary, detail, status, evidence, confidence, created_by, created_at";

/** Strip characters that would confuse PostgREST's `.or()` filter DSL. */
function safeSearch(term: string): string {
  return term.replace(/[%,()\\*]/g, " ").trim();
}

export class SupabaseInsightsRepository {
  constructor(private readonly db: AuxionSupabaseClient) {}

  private fail(op: string, message: string): never {
    throw new Error(`insights.${op} failed: ${message}`);
  }

  /** Workspace summary — four bounded head-count queries (no rows transferred). */
  async summary(clientId: string | null): Promise<InsightSummary> {
    const cutoff = new Date(Date.now() - INSIGHT_RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const base = () => {
      const q = this.db.from("insights").select("*", { count: "exact", head: true });
      return clientId ? q.eq("client_id", clientId) : q;
    };
    const [open, endorsed, dismissed, recent] = await Promise.all([
      base().neq("status", "dismissed"),
      base().eq("status", "endorsed"),
      base().eq("status", "dismissed"),
      base().gte("created_at", cutoff),
    ]);
    if (open.error) this.fail("summary", open.error.message);
    if (endorsed.error) this.fail("summary", endorsed.error.message);
    if (dismissed.error) this.fail("summary", dismissed.error.message);
    if (recent.error) this.fail("summary", recent.error.message);

    return {
      open: open.count ?? 0,
      endorsed: endorsed.count ?? 0,
      dismissed: dismissed.count ?? 0,
      recent: recent.count ?? 0,
    };
  }

  /** Paginated, filtered, sorted list — bounded and enriched without N+1. */
  async list(query: InsightListQuery): Promise<InsightListData> {
    let q = this.db.from("insights").select(LIST_COLUMNS, { count: "exact" });

    if (query.clientId) q = q.eq("client_id", query.clientId);

    if (query.status === "open") q = q.neq("status", "dismissed");
    else if (query.status !== "all") q = q.eq("status", query.status as InsightStatusEnum);

    if (query.search) {
      const term = safeSearch(query.search);
      if (term) {
        // Also match insights whose organization or parent-signal title matches.
        const [orgIds, signalIds] = await Promise.all([
          this.clientIdsMatching(term),
          this.signalIdsMatching(term),
        ]);
        const ors = [`summary.ilike.%${term}%`, `detail.ilike.%${term}%`];
        if (orgIds.length > 0) ors.push(`client_id.in.(${orgIds.join(",")})`);
        if (signalIds.length > 0) ors.push(`signal_id.in.(${signalIds.join(",")})`);
        q = q.or(ors.join(","));
      }
    }

    if (query.sort === "oldest") q = q.order("created_at", { ascending: true });
    else if (query.sort === "confidence")
      q = q.order("confidence", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
    else q = q.order("created_at", { ascending: false });

    const offset = (query.page - 1) * INSIGHT_PAGE_SIZE;
    q = q.range(offset, offset + INSIGHT_PAGE_SIZE - 1);

    const { data, count, error } = await q;
    if (error) this.fail("list", error.message);
    const rows = data ?? [];
    const insights = rows.map((r) => toInsight(r));

    const orgNames = await this.orgNames(insights.map((i) => i.clientId));
    const actorNames = await this.actorNames(
      insights.map((i) => i.createdBy).filter((v): v is string => Boolean(v)),
    );
    const signalTitles = await this.signalTitles(insights.map((i) => i.signalId));

    return { insights, total: count ?? 0, orgNames, actorNames, signalTitles };
  }

  /** A single insight + its org, author, parent signal, and history — for the detail page. */
  async getById(id: string): Promise<InsightDetailData | null> {
    const { data, error } = await this.db.from("insights").select(DETAIL_COLUMNS).eq("id", id).maybeSingle();
    if (error) this.fail("getById", error.message);
    if (!data) return null;

    const insight = toInsight(data);
    const orgNames = await this.orgNames([insight.clientId]);
    const actorNames = insight.createdBy ? await this.actorNames([insight.createdBy]) : {};
    const parent = await this.signalRef(insight.signalId);
    const transitions = await this.listTransitions(id);

    return {
      insight,
      orgName: orgNames[insight.clientId] ?? "Unknown org",
      createdByName: insight.createdBy ? (actorNames[insight.createdBy] ?? null) : null,
      signalTitle: parent?.title ?? "Unknown signal",
      signalStatus: parent?.status ?? "",
      transitions,
    };
  }

  /** Transition history for an insight, newest-first, with actor names resolved. */
  async listTransitions(insightId: string): Promise<InsightTransition[]> {
    const { data, error } = await this.db
      .from("transition_log")
      .select("from_state, to_state, actor_id, at, reason")
      .eq("entity_type", "insight")
      .eq("entity_id", insightId)
      .order("at", { ascending: false })
      .limit(100);
    if (error) this.fail("listTransitions", error.message);
    const rows = data ?? [];
    const names = await this.actorNames(rows.map((r) => r.actor_id).filter((v): v is string => Boolean(v)));
    return rows.map((r) => ({
      from: r.from_state,
      to: r.to_state,
      actorName: r.actor_id ? (names[r.actor_id] ?? r.actor_id) : null,
      at: r.at,
      reason: r.reason,
    }));
  }

  /** Organizations (for the list's org filter). Bounded; internal reads all via RLS. */
  async listOrganizations(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await this.db
      .from("clients")
      .select("id, company")
      .order("company", { ascending: true })
      .limit(200);
    if (error) this.fail("listOrganizations", error.message);
    return (data ?? []).map((r) => ({ id: r.id, name: r.company }));
  }

  /**
   * Signals that can be interpreted into an insight — the link targets for the
   * create form. Archived signals are excluded (you interpret live signals). Org
   * names are resolved in one `.in()` (no N+1). Bounded.
   */
  async listLinkableSignals(clientId: string | null): Promise<LinkableSignal[]> {
    let q = this.db
      .from("signals")
      .select("id, client_id, title, status")
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(200);
    if (clientId) q = q.eq("client_id", clientId);
    const { data, error } = await q;
    if (error) this.fail("listLinkableSignals", error.message);
    const rows = data ?? [];
    const orgNames = await this.orgNames(rows.map((r) => r.client_id));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      clientId: r.client_id,
      orgName: orgNames[r.client_id] ?? "Unknown org",
    }));
  }

  /**
   * Resolve a parent signal by id — used server-side to derive an insight's tenant
   * from the signal it interprets (never trust a client-supplied clientId) and to
   * confirm the link target exists.
   */
  async signalRef(signalId: string): Promise<SignalRef | null> {
    const { data, error } = await this.db
      .from("signals")
      .select("id, client_id, title, status")
      .eq("id", signalId)
      .maybeSingle();
    if (error) this.fail("signalRef", error.message);
    if (!data) return null;
    return { id: data.id, clientId: data.client_id, title: data.title, status: data.status };
  }

  /* ---- private enrichment helpers ---------------------------------------- */

  private async clientIdsMatching(term: string): Promise<string[]> {
    const { data, error } = await this.db.from("clients").select("id").ilike("company", `%${term}%`).limit(50);
    if (error) this.fail("clientIdsMatching", error.message);
    return (data ?? []).map((r) => r.id);
  }

  private async signalIdsMatching(term: string): Promise<string[]> {
    const { data, error } = await this.db.from("signals").select("id").ilike("title", `%${term}%`).limit(50);
    if (error) this.fail("signalIdsMatching", error.message);
    return (data ?? []).map((r) => r.id);
  }

  private async signalTitles(signalIds: readonly string[]): Promise<Record<string, string>> {
    const ids = [...new Set(signalIds)];
    if (ids.length === 0) return {};
    const { data, error } = await this.db.from("signals").select("id, title").in("id", ids);
    if (error) this.fail("signalTitles", error.message);
    const out: Record<string, string> = {};
    for (const r of data ?? []) out[r.id] = r.title;
    return out;
  }

  private async orgNames(clientIds: readonly string[]): Promise<Record<string, string>> {
    const ids = [...new Set(clientIds)];
    if (ids.length === 0) return {};
    const { data, error } = await this.db.from("clients").select("id, company").in("id", ids);
    if (error) this.fail("orgNames", error.message);
    const out: Record<string, string> = {};
    for (const r of data ?? []) out[r.id] = r.company;
    return out;
  }

  private async actorNames(userIds: readonly string[]): Promise<Record<string, string>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return {};
    const { data, error } = await this.db.from("users").select("id, name").in("id", ids);
    if (error) this.fail("actorNames", error.message);
    const out: Record<string, string> = {};
    for (const r of data ?? []) out[r.id] = r.name;
    return out;
  }
}
