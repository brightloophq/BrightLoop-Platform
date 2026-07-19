import { describe, it, expect } from "vitest";
import type { BusinessScan, Domain, ScanFinding } from "@brightloop/schema";
import type { Actor } from "../capabilities.js";
import { AuthorizationError } from "../errors.js";
import { CoreSurfaceService } from "./service.js";
import type { CoreSurfaceRepository } from "./repository.js";

/** Minimal in-memory fake — the service owns rules; the repo just stores. */
function fakeRepo() {
  const scans: BusinessScan[] = [];
  const domains: Domain[] = [];
  const findings: ScanFinding[] = [];
  const repo: CoreSurfaceRepository = {
    async createScan(r) { scans.push(r); return r; },
    async getScan(id) { return scans.find((s) => s.id === id) ?? null; },
    async latestScan(cid) { return scans.filter((s) => s.clientId === cid).at(-1) ?? null; },
    async setScanStatus(id, status) { const s = scans.find((x) => x.id === id)!; s.status = status; return s; },
    async createFinding(r) { findings.push(r); return r; },
    async listFindings(sid) { return findings.filter((f) => f.scanId === sid); },
    async upsertDomain(r) { domains.push(r); return r; },
    async listDomains(cid) { return domains.filter((d) => d.clientId === cid); },
    async setDomainStatus(cid, key, status, score) {
      const d = domains.find((x) => x.clientId === cid && x.key === key)!;
      d.status = status; if (score !== undefined) d.currentScore = score; return d;
    },
  };
  return { repo, scans, domains, findings };
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
});
