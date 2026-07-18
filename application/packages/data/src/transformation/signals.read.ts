/* =============================================================================
 * Signals — Supabase READ adapter (Sprint 5).
 *
 * Fully typed against the generated Database types (no untyped cast, no `any`).
 * Reads are bounded (range + exact count), select only needed columns, and sort
 * on indexed columns. Enrichment (org + actor names) is done with a couple of
 * `.in()` lookups — never N+1. WRITES do NOT live here: they flow through the
 * TransformationService so lifecycle guards + audit + events are enforced.
 *
 * RLS is the real boundary — signals are internal-only, and the request-scoped
 * client carries the caller's session, so this adapter cannot widen what the
 * caller may see. The optional org filter is defence-in-depth, never a bypass.
 * ========================================================================== */

import type { Database } from "@brightloop/db";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import {
  SIGNAL_PAGE_SIZE,
  SIGNAL_RECENT_DAYS,
  type SignalListQuery,
  type SignalListData,
  type SignalDetailData,
  type SignalSummary,
  type SignalTransition,
} from "@brightloop/domain";
import { toSignal } from "./mappers.js";

type SignalStatusEnum = Database["public"]["Enums"]["signal_status"];

const LIST_COLUMNS = "id, client_id, title, status, source_ref, created_by, created_at";
const DETAIL_COLUMNS = "id, client_id, title, detail, status, source_ref, evidence, created_by, created_at";

/** Strip characters that would confuse PostgREST's `.or()` filter DSL. */
function safeSearch(term: string): string {
  return term.replace(/[%,()\\*]/g, " ").trim();
}

export class SupabaseSignalsRepository {
  constructor(private readonly db: AuxionSupabaseClient) {}

  private fail(op: string, message: string): never {
    throw new Error(`signals.${op} failed: ${message}`);
  }

  /** Workspace summary — four bounded head-count queries (no rows transferred). */
  async summary(clientId: string | null): Promise<SignalSummary> {
    const cutoff = new Date(Date.now() - SIGNAL_RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const base = () => {
      const q = this.db.from("signals").select("*", { count: "exact", head: true });
      return clientId ? q.eq("client_id", clientId) : q;
    };
    const [open, prioritized, archived, recent] = await Promise.all([
      base().neq("status", "archived"),
      base().eq("status", "prioritized"),
      base().eq("status", "archived"),
      base().gte("created_at", cutoff),
    ]);
    if (open.error) this.fail("summary", open.error.message);
    if (prioritized.error) this.fail("summary", prioritized.error.message);
    if (archived.error) this.fail("summary", archived.error.message);
    if (recent.error) this.fail("summary", recent.error.message);

    return {
      open: open.count ?? 0,
      prioritized: prioritized.count ?? 0,
      archived: archived.count ?? 0,
      recent: recent.count ?? 0,
    };
  }

  /** Paginated, filtered, sorted list — bounded and enriched without N+1. */
  async list(query: SignalListQuery): Promise<SignalListData> {
    let q = this.db.from("signals").select(LIST_COLUMNS, { count: "exact" });

    if (query.clientId) q = q.eq("client_id", query.clientId);

    if (query.status === "open") q = q.neq("status", "archived");
    else if (query.status !== "all") q = q.eq("status", query.status as SignalStatusEnum);

    if (query.search) {
      const term = safeSearch(query.search);
      if (term) {
        // Also match signals whose organization name matches the term.
        const orgIds = await this.clientIdsMatching(term);
        const ors = [`title.ilike.%${term}%`, `detail.ilike.%${term}%`, `source_ref.ilike.%${term}%`];
        if (orgIds.length > 0) ors.push(`client_id.in.(${orgIds.join(",")})`);
        q = q.or(ors.join(","));
      }
    }

    if (query.sort === "oldest") q = q.order("created_at", { ascending: true });
    else if (query.sort === "title") q = q.order("title", { ascending: true });
    else q = q.order("created_at", { ascending: false });

    const offset = (query.page - 1) * SIGNAL_PAGE_SIZE;
    q = q.range(offset, offset + SIGNAL_PAGE_SIZE - 1);

    const { data, count, error } = await q;
    if (error) this.fail("list", error.message);
    const rows = data ?? [];
    const signals = rows.map((r) => toSignal(r));

    const orgNames = await this.orgNames(signals.map((s) => s.clientId));
    const actorNames = await this.actorNames(
      signals.map((s) => s.createdBy).filter((v): v is string => Boolean(v)),
    );

    return { signals, total: count ?? 0, orgNames, actorNames };
  }

  /** A single signal + its org, author, and transition history — for the detail page. */
  async getById(id: string): Promise<SignalDetailData | null> {
    const { data, error } = await this.db.from("signals").select(DETAIL_COLUMNS).eq("id", id).maybeSingle();
    if (error) this.fail("getById", error.message);
    if (!data) return null;

    const signal = toSignal(data);
    const orgNames = await this.orgNames([signal.clientId]);
    const actorNames = signal.createdBy ? await this.actorNames([signal.createdBy]) : {};
    const transitions = await this.listTransitions(id);

    return {
      signal,
      orgName: orgNames[signal.clientId] ?? "Unknown org",
      createdByName: signal.createdBy ? (actorNames[signal.createdBy] ?? null) : null,
      transitions,
    };
  }

  /** Transition history for a signal, newest-first, with actor names resolved. */
  async listTransitions(signalId: string): Promise<SignalTransition[]> {
    const { data, error } = await this.db
      .from("transition_log")
      .select("from_state, to_state, actor_id, at, reason")
      .eq("entity_type", "signal")
      .eq("entity_id", signalId)
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

  /* ---- private enrichment helpers ---------------------------------------- */

  private async clientIdsMatching(term: string): Promise<string[]> {
    const { data, error } = await this.db.from("clients").select("id").ilike("company", `%${term}%`).limit(50);
    if (error) this.fail("clientIdsMatching", error.message);
    return (data ?? []).map((r) => r.id);
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
