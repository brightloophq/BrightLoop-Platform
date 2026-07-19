/* =============================================================================
 * CoreSurfaceService (Phase 1B) — writes for Business Scan / Activation.
 * Every mutation: capability → validate (shared Zod owns the shape) → persist
 * (RLS-scoped repo) → attribution. Human/system-entered data; the Auxiliary
 * engine is deferred — no method calls a model or a queue.
 * ========================================================================== */

import {
  domainSchema,
  businessScanSchema,
  scanFindingSchema,
  type BusinessScan,
  type Domain,
  type DomainKey,
  type DomainStatus,
  type ScanFinding,
  type FindingPriority,
} from "@brightloop/schema";
import { type Actor, assertCapability } from "../capabilities.js";
import { systemClock, type Clock } from "../guard.js";
import { SCAN_WRITE_CAP, ACTIVATION_WRITE_CAP } from "./read.js";
import type { CoreSurfaceRepository } from "./repository.js";

export type CoreIdGen = (prefix: string) => string;

export interface CoreSurfaceServiceDeps {
  repo: CoreSurfaceRepository;
  clock?: Clock;
  ids: CoreIdGen;
}

export interface NewScan {
  clientId: string;
  baselineIndex: number;
  targetIndex?: number;
}
export interface NewFinding {
  scanId: string;
  clientId: string;
  domainKey: DomainKey;
  finding: string;
  baseline?: string | null;
  priority?: FindingPriority;
}

export class CoreSurfaceService {
  private readonly repo: CoreSurfaceRepository;
  private readonly clock: Clock;
  private readonly ids: CoreIdGen;

  constructor(deps: CoreSurfaceServiceDeps) {
    this.repo = deps.repo;
    this.clock = deps.clock ?? systemClock;
    this.ids = deps.ids;
  }

  /** Open a Business Scan (Diagnose stage). Service owns id/status/attribution. */
  async createScan(actor: Actor, input: NewScan): Promise<BusinessScan> {
    assertCapability(actor, SCAN_WRITE_CAP);
    const record = businessScanSchema.parse({
      id: this.ids("scn"),
      clientId: input.clientId,
      status: "diagnosing",
      baselineIndex: input.baselineIndex,
      targetIndex: input.targetIndex ?? 92,
      createdBy: actor.userId,
      createdAt: this.clock(),
    });
    return this.repo.createScan(record);
  }

  /** Record a per-domain diagnosis finding. */
  async addFinding(actor: Actor, input: NewFinding): Promise<ScanFinding> {
    assertCapability(actor, SCAN_WRITE_CAP);
    const record = scanFindingSchema.parse({
      id: this.ids("fnd"),
      scanId: input.scanId,
      clientId: input.clientId,
      domainKey: input.domainKey,
      finding: input.finding,
      baseline: input.baseline ?? null,
      priority: input.priority ?? "medium",
      createdAt: this.clock(),
    });
    return this.repo.createFinding(record);
  }

  /** Seed/refresh a domain node (baseline from a scan, or a live current score). */
  async upsertDomain(
    actor: Actor,
    input: { clientId: string; key: DomainKey; status?: DomainStatus; baselineScore?: number | null; currentScore?: number | null },
  ): Promise<Domain> {
    assertCapability(actor, SCAN_WRITE_CAP);
    const record = domainSchema.parse({
      id: this.ids("dom"),
      clientId: input.clientId,
      key: input.key,
      status: input.status ?? "not_operating",
      baselineScore: input.baselineScore ?? null,
      currentScore: input.currentScore ?? null,
      createdAt: this.clock(),
    });
    return this.repo.upsertDomain(record);
  }

  /** Activation: bring a domain Operating (or set an interim status/score). */
  async activateDomain(
    actor: Actor,
    input: { clientId: string; key: DomainKey; status: DomainStatus; currentScore?: number | null },
  ): Promise<Domain> {
    assertCapability(actor, ACTIVATION_WRITE_CAP);
    return this.repo.setDomainStatus(input.clientId, input.key, input.status, input.currentScore ?? null);
  }

  /** Advance a scan's stage (diagnosing → diagnosed → activating → operating). */
  async setScanStatus(actor: Actor, id: string, status: BusinessScan["status"]): Promise<BusinessScan> {
    assertCapability(actor, ACTIVATION_WRITE_CAP);
    return this.repo.setScanStatus(id, status);
  }
}

export function createCoreSurfaceService(deps: CoreSurfaceServiceDeps): CoreSurfaceService {
  return new CoreSurfaceService(deps);
}
