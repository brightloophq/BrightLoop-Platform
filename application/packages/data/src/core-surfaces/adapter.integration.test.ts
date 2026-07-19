/* =============================================================================
 * SupabaseCoreSurfaceRepository — LIVE integration tests (Phase 1B).
 * Runs only against an ephemeral Supabase with migrations applied (CI db-verify /
 * `pnpm --filter @brightloop/data test:integration`). Excluded from the default
 * unit run. Verifies the typed round-trip under an internal (owner) RLS session.
 * ========================================================================== */

import { createHmac, randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@brightloop/db";
import { SupabaseCoreSurfaceRepository } from "./adapter.js";

const URL = process.env["SUPABASE_TEST_URL"];
const SERVICE_KEY = process.env["SUPABASE_TEST_SERVICE_KEY"];
const ANON_KEY = process.env["SUPABASE_TEST_ANON_KEY"];
const JWT_SECRET = process.env["SUPABASE_TEST_JWT_SECRET"];
const LIVE = Boolean(URL && SERVICE_KEY && ANON_KEY && JWT_SECRET);

function signJwt(claims: Record<string, unknown>, secret: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({ role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600, ...claims });
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}
const uid = () => `t_${randomUUID().slice(0, 8)}`;
const now = () => new Date().toISOString();

describe.skipIf(!LIVE)("SupabaseCoreSurfaceRepository (live DB)", () => {
  let service: SupabaseClient<Database>;
  let internal: SupabaseClient<Database>;
  let clientId: string;

  beforeAll(async () => {
    service = createClient<Database>(URL!, SERVICE_KEY!, { auth: { persistSession: false } });
    clientId = uid();
    await service.from("clients").insert({ id: clientId, company: `Org ${clientId}` });
    const token = signJwt({ sub: uid(), app_metadata: { role: "owner" } }, JWT_SECRET!);
    internal = createClient<Database>(URL!, ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
  });

  it("round-trips scan → domains → activation → findings under internal RLS", async () => {
    const repo = new SupabaseCoreSurfaceRepository(internal);

    const scan = await repo.createScan({
      id: uid(), clientId, status: "diagnosing", baselineIndex: 34, targetIndex: 92, createdBy: null, createdAt: now(),
    });
    expect(scan.status).toBe("diagnosing");

    const dom = await repo.upsertDomain({
      id: uid(), clientId, key: "sales", status: "not_operating", baselineScore: 34, currentScore: null, createdAt: now(),
    });
    expect(dom.key).toBe("sales");
    expect(await repo.listDomains(clientId)).toHaveLength(1);

    const activated = await repo.setDomainStatus(clientId, "sales", "operating", 90);
    expect(activated.status).toBe("operating");
    expect(activated.currentScore).toBe(90);

    const finding = await repo.createFinding({
      id: uid(), scanId: scan.id, clientId, domainKey: "sales", finding: "No structured pipeline", baseline: "38%", priority: "high", createdAt: now(),
    });
    expect(finding.priority).toBe("high");
    expect(await repo.listFindings(scan.id)).toHaveLength(1);

    expect((await repo.latestScan(clientId))?.id).toBe(scan.id);
  });
});
