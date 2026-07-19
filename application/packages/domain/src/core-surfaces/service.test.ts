import { describe, it, expect } from "vitest";
import { DOMAIN_KEYS, type BusinessScan, type Domain, type ScanFinding } from "@brightloop/schema";
import type { Actor } from "../capabilities.js";
import { AuthorizationError } from "../errors.js";
import { CoreSurfaceService } from "./service.js";
import type { CoreSurfaceRepository } from "./repository.js";

/** Minimal in-memory fake — the service owns rules; the repo just stores. */
function fakeRepo() {
  const scans: BusinessScan[] = [];
  const domains: Domain[] = [];
  const findings: ScanFinding[] = [];
  const users = new Map<string, string>(); // authUuid -> internal users.id
  const ctl = { failCreateScan: false };
  const repo: CoreSurfaceRepository = {
    // identity fallback keeps attribution simple in tests that don't map users
    async resolveUserId(a) { return users.get(a) ?? a; },
    async createScan(r) {
      if (ctl.failCreateScan) throw new Error('core-surfaces.createScan failed: violates foreign key constraint "business_scans_created_by_fkey"');
      scans.push(r); return r;
    },
    async getScan(id) { return scans.find((s) => s.id === id) ?? null; },
    async latestScan(cid) { return scans.filter((s) => s.clientId === cid).at(-1) ?? null; },
    async setScanStatus(id, status) { const s = scans.find((x) => x.id === id)!; s.status = status; return s; },
    async createFinding(r) { findings.push(r); return r; },
    async listFindings(sid) { return findings.filter((f) => f.scanId === sid); },
    async upsertDomain(r) { domains.push(r); return r; },
    async listDomains(cid) { return domains.filter((d) => d.clientId === cid); },
    async listAllDomains() { return domains; },
    async setDomainStatus(cid, key, status, score) {
      const d = domains.find((x) => x.clientId === cid && x.key === key)!;
      d.status = status; if (score !== undefined) d.currentScore = score; return d;
    },
  };
  return { repo, scans, domains, findings, users, ctl };
}

const owner: Actor = { userId: "u1", role: "owner", clientId: null };
const clientAdmin: Actor = { userId: "u3", role: "client_admin", clientId: "cli_A" };
let n = 0;
const ids = (p: string) => `${p}_${++n}`;

describe("CoreSurfaceService", () => {
  it("creates a scan in 'diagnosing' with the actor as author", async () => {
    const { repo, scans } = fakeRepo();
    const svc = new CoreSurfaceService({ repo, ids, clock: () => "2026-07-19T00:00:00.000Z" });
    const scan = await svc.createScan(owner, { clientId: "cli_A", baselineIndex: 34 });
    expect(scan.status).toBe("diagnosing");
    expect(scan.createdBy).toBe("u1");
    expect(scan.targetIndex).toBe(92);
    expect(scans).toHaveLength(1);
  });

  it("adds a finding with a default priority", async () => {
    const { repo } = fakeRepo();
    const svc = new CoreSurfaceService({ repo, ids });
    const f = await svc.addFinding(owner, { scanId: "scn_1", clientId: "cli_A", domainKey: "web", finding: "converts at 1.2%" });
    expect(f.priority).toBe("medium");
    expect(f.domainKey).toBe("web");
  });

  it("activates a domain to Operating", async () => {
    const { repo, domains } = fakeRepo();
    const svc = new CoreSurfaceService({ repo, ids });
    await svc.upsertDomain(owner, { clientId: "cli_A", key: "sales", status: "assembling" });
    const d = await svc.activateDomain(owner, { clientId: "cli_A", key: "sales", status: "operating", currentScore: 90 });
    expect(d.status).toBe("operating");
    expect(domains[0]?.currentScore).toBe(90);
  });

  it("denies a client role every write (capability)", async () => {
    const { repo } = fakeRepo();
    const svc = new CoreSurfaceService({ repo, ids });
    await expect(svc.createScan(clientAdmin, { clientId: "cli_A", baselineIndex: 34 })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(svc.addFinding(clientAdmin, { scanId: "s", clientId: "cli_A", domainKey: "web", finding: "x" })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(svc.activateDomain(clientAdmin, { clientId: "cli_A", key: "web", status: "operating" })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("resolves created_by to the INTERNAL user id, never the auth uuid", async () => {
    const { repo, users } = fakeRepo();
    users.set("auth-owner", "usr_owner"); // JWT sub -> internal id
    const svc = new CoreSurfaceService({ repo, ids });
    const scan = await svc.createScan({ userId: "auth-owner", role: "owner", clientId: null }, { clientId: "cli_A", baselineIndex: 0 });
    expect(scan.createdBy).toBe("usr_owner");
  });

  it("stores null attribution when no internal user row exists (FK-safe)", async () => {
    const { repo, users } = fakeRepo();
    users.clear();
    // resolveUserId identity fallback would return the uuid; force a real miss:
    repo.resolveUserId = async () => null;
    const svc = new CoreSurfaceService({ repo, ids });
    const scan = await svc.createScan(owner, { clientId: "cli_A", baselineIndex: 0 });
    expect(scan.createdBy).toBeNull();
  });
});

describe("CoreSurfaceService.startDiagnosis (idempotent Diagnose bootstrap)", () => {
  it("creates a scan and seeds exactly the seven domains, unlit", async () => {
    const { repo, scans, domains } = fakeRepo();
    const svc = new CoreSurfaceService({ repo, ids });
    const scan = await svc.startDiagnosis(owner, { clientId: "cli_A", targetIndex: 92 });
    expect(scan.status).toBe("diagnosing");
    expect(scans).toHaveLength(1);
    expect(domains).toHaveLength(DOMAIN_KEYS.length);
    expect(new Set(domains.map((d) => d.key))).toEqual(new Set(DOMAIN_KEYS));
    expect(domains.every((d) => d.status === "not_operating")).toBe(true);
  });

  it("is idempotent — a repeated submission adds no second scan and no duplicate domains", async () => {
    const { repo, scans, domains } = fakeRepo();
    const svc = new CoreSurfaceService({ repo, ids });
    const first = await svc.startDiagnosis(owner, { clientId: "cli_A" });
    const second = await svc.startDiagnosis(owner, { clientId: "cli_A" });
    expect(second.id).toBe(first.id);
    expect(scans).toHaveLength(1);
    expect(domains).toHaveLength(DOMAIN_KEYS.length);
  });

  it("denies a client-scoped actor (capability + wrong scope)", async () => {
    const { repo, scans } = fakeRepo();
    const svc = new CoreSurfaceService({ repo, ids });
    await expect(svc.startDiagnosis(clientAdmin, { clientId: "cli_A" })).rejects.toBeInstanceOf(AuthorizationError);
    expect(scans).toHaveLength(0);
  });

  it("surfaces the real typed repository failure (no swallow)", async () => {
    const { repo, ctl } = fakeRepo();
    ctl.failCreateScan = true;
    const svc = new CoreSurfaceService({ repo, ids });
    await expect(svc.startDiagnosis(owner, { clientId: "cli_A" })).rejects.toThrow(/core-surfaces\.createScan failed/);
  });

  it("scopes seeding to the requested client only", async () => {
    const { repo, domains } = fakeRepo();
    const svc = new CoreSurfaceService({ repo, ids });
    await svc.startDiagnosis(owner, { clientId: "cli_A" });
    expect(domains.filter((d) => d.clientId === "cli_B")).toHaveLength(0);
  });
});
