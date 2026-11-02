import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@brightloop/domain";

const mock = vi.hoisted(() => ({
  actor: null as Actor | null,
  review: vi.fn(),
  scan: vi.fn(),
  rpc: vi.fn(),
  conversion: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getActor: async () => mock.actor }));
vi.mock("@/lib/runtime-api", () => ({ buildAppContext: async () => ({ actor: mock.actor }) }));
vi.mock("@brightloop/application", () => ({ getProspectPackageReview: mock.review, getScan: mock.scan }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  rpc: mock.rpc,
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mock.conversion }) }) }),
}) }));
import { GET, POST } from "./route";

const owner: Actor = { userId: "owner-auth-id", role: "owner", clientId: null };
const team: Actor = { userId: "team-auth-id", role: "team_member", clientId: null };
const request = (body: unknown) => new Request("http://localhost/api/internal/runtime/package-conversion", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const ready = { readiness: { clientReady: true, reason: "Package is ready." } };

beforeEach(() => {
  mock.actor = owner;
  mock.review.mockReset().mockResolvedValue(ready);
  mock.scan.mockReset().mockResolvedValue({ clientId: "client-1" });
  mock.rpc.mockReset();
  mock.conversion.mockReset().mockResolvedValue({ data: null, error: null });
});

describe("scanner sales conversion API", () => {
  it("denies team members regardless of submitted identifiers", async () => {
    mock.actor = team;
    expect((await POST(request({ runId: "run-a", clientId: "other", proposalId: "forged", idempotencyKey: "0123456789abcdef" }))).status).toBe(403);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("fails closed even when legacy conversion identifiers are well formed", async () => {
    expect((await POST(request({ runId: "run-a", idempotencyKey: "0123456789abcdef" }))).status).toBe(409);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("retires the direct-to-proposal write path without invoking its RPC", async () => {
    const response = await POST(request({ runId: "run-a", idempotencyKey: "0123456789abcdef" }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toMatch(/canonical quote promotion/i);
    expect(mock.rpc).not.toHaveBeenCalled();
  });


  it("returns existing private conversion status to the authorized admin UI", async () => {
    mock.conversion.mockResolvedValue({ data: { id: "scv-1", proposal_id: "prp-1", converted_at: "now" }, error: null });
    const response = await GET(new Request("http://localhost/api/internal/runtime/package-conversion?runId=run-a"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ eligible: true, conversion: { proposalId: "prp-1" } });
  });
});
