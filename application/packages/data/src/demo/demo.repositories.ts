/* =============================================================================
 * Demo repositories — serve the demo dataset behind the SAME ports the Supabase
 * adapters implement, so swapping them in Demo Mode changes no page or service.
 *
 * READS return believable demo data. WRITES throw `DemoModeError` — Demo Mode is
 * a read-only viewing experience; a mutation must fail loudly and clearly rather
 * than silently pretend, and it never touches a database.
 * ========================================================================== */

import type { BusinessScan, Domain, ScanFinding } from "@brightloop/schema";
import type {
  CoreSurfaceRepository,
  DashboardScope,
  DashboardSnapshot,
  SignalDetailData,
  SignalListData,
  SignalListQuery,
  SignalSummary,
  SignalTransition,
  SignalsReadRepository,
  TransformationDashboardReader,
} from "@brightloop/domain";
import {
  demoAllDomains,
  demoDomainsFor,
  demoFindingsForScan,
  demoOrgSnapshot,
  demoOrgOptions,
  demoPortfolioSnapshot,
  demoScanFor,
  demoSignalDetail,
  demoSignalList,
  demoSignalSummary,
  demoSignalTransitions,
} from "./demo.dataset.js";

/** Thrown when a mutation is attempted while Demo Mode is active. */
export class DemoModeError extends Error {
  constructor(operation: string) {
    super(`Demo Mode is read-only — "${operation}" is disabled. Turn off AUXION_DEMO_MODE to write real data.`);
    this.name = "DemoModeError";
  }
}

/** Demo transformation-dashboard reader. `now` is injected for testability. */
export class DemoTransformationDashboardRepository implements TransformationDashboardReader {
  constructor(private readonly now: () => number = () => Date.now()) {}

  async read(scope: DashboardScope): Promise<DashboardSnapshot> {
    return scope.kind === "organization"
      ? demoOrgSnapshot(scope.clientId, this.now())
      : demoPortfolioSnapshot(this.now());
  }
}

/** Demo Signals read repository. `now` injected for testability. */
export class DemoSignalsRepository implements SignalsReadRepository {
  constructor(private readonly now: () => number = () => Date.now()) {}

  async summary(clientId: string | null): Promise<SignalSummary> {
    return demoSignalSummary(this.now(), clientId);
  }
  async list(query: SignalListQuery): Promise<SignalListData> {
    return demoSignalList(query, this.now());
  }
  async getById(id: string): Promise<SignalDetailData | null> {
    return demoSignalDetail(id, this.now());
  }
  async listTransitions(signalId: string): Promise<SignalTransition[]> {
    return demoSignalTransitions(signalId, this.now());
  }
  async listOrganizations(): Promise<{ id: string; name: string }[]> {
    return demoOrgOptions();
  }
}

/** Demo core-surface repository — reads from the dataset; writes are disabled. */
export class DemoCoreSurfaceRepository implements CoreSurfaceRepository {
  async resolveUserId(): Promise<string | null> {
    return "demo_operator";
  }

  async getScan(id: string): Promise<BusinessScan | null> {
    return demoScanFor(id.replace(/^sc_/, "")) ?? null;
  }

  async latestScan(clientId: string): Promise<BusinessScan | null> {
    return demoScanFor(clientId);
  }

  async listFindings(scanId: string): Promise<ScanFinding[]> {
    return demoFindingsForScan(scanId);
  }

  async listDomains(clientId: string): Promise<Domain[]> {
    return demoDomainsFor(clientId);
  }

  async listAllDomains(): Promise<Domain[]> {
    return demoAllDomains();
  }

  /* ---- writes: disabled in Demo Mode -------------------------------------- */

  async createScan(): Promise<BusinessScan> {
    throw new DemoModeError("createScan");
  }
  async setScanStatus(): Promise<BusinessScan> {
    throw new DemoModeError("setScanStatus");
  }
  async createFinding(): Promise<ScanFinding> {
    throw new DemoModeError("createFinding");
  }
  async upsertDomain(): Promise<Domain> {
    throw new DemoModeError("upsertDomain");
  }
  async setDomainStatus(): Promise<Domain> {
    throw new DemoModeError("setDomainStatus");
  }
}
