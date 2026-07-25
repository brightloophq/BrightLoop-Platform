/* =============================================================================
 * Supabase Transformation Execution repositories (Phase D · Sprint D1).
 *
 * Production adapters for the three Phase D ports. Constructed per request with
 * the caller's RLS-scoped session — the adapter adds NO tenant filters; RLS
 * (layer 3) + the application capability check (layer 2) are the gates. Never
 * cache across requests.
 *
 * ██ TYPING NOTE ██
 *   Addressed through an untyped `SupabaseClient` view via a single documented
 *   cast at construction — the new tables model status as `string` in the domain
 *   schema, and the mappers are the type-safe boundary (exercised by the live
 *   pgTAP + integration suites). Mirrors `SupabaseTransformationRepository`.
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Initiative, TransformationActivity, TransformationWorkspace } from "@brightloop/schema";
import {
  err,
  mapDatabaseError,
  ok,
  type InitiativeRepository,
  type RuntimeResult,
  type TransformationActivityRepository,
  type TransformationWorkspaceRepository,
} from "@brightloop/domain";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import * as m from "./mappers.js";

const WS = "transformation_workspace";
const INIT = "transformation_initiative";
const ACT = "transformation_activity";

export class SupabaseTransformationWorkspaceRepository implements TransformationWorkspaceRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) {
    this.db = client as unknown as SupabaseClient;
  }

  async create(workspace: TransformationWorkspace): Promise<RuntimeResult<TransformationWorkspace>> {
    const { data, error } = await this.db.from(WS).insert(m.workspaceRow(workspace)).select("*").single();
    if (error) return mapDatabaseError(error, "transformationWorkspace.create");
    return ok("created", m.toWorkspace(data as Record<string, unknown>));
  }

  async getById(id: string): Promise<RuntimeResult<TransformationWorkspace | null>> {
    const { data, error } = await this.db.from(WS).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "transformationWorkspace.getById");
    return ok("found", data ? m.toWorkspace(data as Record<string, unknown>) : null);
  }

  async getBySeed(scanRunId: string, seedChecksum: string): Promise<RuntimeResult<TransformationWorkspace | null>> {
    const { data, error } = await this.db.from(WS).select("*").eq("scan_run_id", scanRunId).eq("seed_checksum", seedChecksum).maybeSingle();
    if (error) return mapDatabaseError(error, "transformationWorkspace.getBySeed");
    return ok("found", data ? m.toWorkspace(data as Record<string, unknown>) : null);
  }

  async listByClient(): Promise<RuntimeResult<TransformationWorkspace[]>> {
    // RLS scopes the visible set; no explicit client filter (internal sees all).
    const { data, error } = await this.db.from(WS).select("*").order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "transformationWorkspace.listByClient");
    return ok("found", (data ?? []).map((r) => m.toWorkspace(r as Record<string, unknown>)));
  }
}

export class SupabaseInitiativeRepository implements InitiativeRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) {
    this.db = client as unknown as SupabaseClient;
  }

  async createMany(initiatives: readonly Initiative[]): Promise<RuntimeResult<Initiative[]>> {
    if (initiatives.length === 0) return ok("created", []);
    const { data, error } = await this.db.from(INIT).insert(initiatives.map(m.initiativeRow)).select("*");
    if (error) return mapDatabaseError(error, "initiative.createMany");
    return ok("created", (data ?? []).map((r) => m.toInitiative(r as Record<string, unknown>)));
  }

  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<Initiative[]>> {
    const { data, error } = await this.db.from(INIT).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: true });
    if (error) return mapDatabaseError(error, "initiative.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toInitiative(r as Record<string, unknown>)));
  }

  async getById(id: string): Promise<RuntimeResult<Initiative | null>> {
    const { data, error } = await this.db.from(INIT).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "initiative.getById");
    return ok("found", data ? m.toInitiative(data as Record<string, unknown>) : null);
  }

  async save(next: Initiative, expectedVersion: number): Promise<RuntimeResult<Initiative>> {
    // Optimistic concurrency: the UPDATE only matches the expected version; a
    // concurrent transition leaves zero rows → `conflict`.
    const { data, error } = await this.db
      .from(INIT)
      .update({ execution_status: next.executionStatus, version: next.version })
      .eq("id", next.id)
      .eq("version", expectedVersion)
      .select("*")
      .maybeSingle();
    if (error) return mapDatabaseError(error, "initiative.save");
    if (data === null) return err("conflict", "initiative.save: version mismatch (concurrent transition)");
    return ok("updated", m.toInitiative(data as Record<string, unknown>));
  }
}

export class SupabaseTransformationActivityRepository implements TransformationActivityRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) {
    this.db = client as unknown as SupabaseClient;
  }

  async append(record: TransformationActivity): Promise<RuntimeResult<TransformationActivity>> {
    const { data, error } = await this.db.from(ACT).insert(m.activityRow(record)).select("*").single();
    if (error) {
      // Idempotent append: a duplicate command_id means this activity already exists.
      if (error.code === "23505") {
        const existing = await this.db.from(ACT).select("*").eq("command_id", record.commandId).maybeSingle();
        if (existing.error) return mapDatabaseError(existing.error, "activity.append.reread");
        if (existing.data) return ok("replayed", m.toActivity(existing.data as Record<string, unknown>));
      }
      return mapDatabaseError(error, "activity.append");
    }
    return ok("created", m.toActivity(data as Record<string, unknown>));
  }

  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<TransformationActivity[]>> {
    const { data, error } = await this.db.from(ACT).select("*").eq("workspace_id", workspaceId).order("at", { ascending: true });
    if (error) return mapDatabaseError(error, "activity.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toActivity(r as Record<string, unknown>)));
  }
}
