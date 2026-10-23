import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@brightloop/domain";
import type * as ApplicationModule from "@brightloop/application";
import { ConflictError } from "@brightloop/application";

const session = vi.hoisted(() => ({ actor: null as Actor | null, save: vi.fn(), review: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getActor: async () => session.actor }));
vi.mock("@/lib/runtime-api", () => ({ buildAppContext: async () => ({ actor: session.actor }) }));
vi.mock("@brightloop/application", async (original) => ({
  ...await original<typeof ApplicationModule>(), setProposalPricing: session.save, getProspectPackageReview: session.review,
}));
import { POST } from "./route";

const request = (body: unknown) => new Request("http://localhost/api/internal/runtime/proposal-pricing", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

beforeEach(() => {
  session.actor = { userId: "owner", role: "owner", clientId: null };
  session.save.mockReset();
  session.review.mockReset();
});

describe("versioned proposal pricing API", () => {
  it("forwards the current version precondition beside pricing", async () => {
    session.save.mockResolvedValue({ id: "p2", version: 2 });
    session.review.mockResolvedValue({ decision: "pending", bindingStatus: "stale", currentBinding: { proposal: { version: 2 } } });
    const response = await POST(request({ runId: "run", expectedVersion: 1, pricing: { currency: "USD", items: [] } }));
    expect(response.status).toBe(200);
    expect(session.save).toHaveBeenCalledWith(expect.anything(), "run", { currency: "USD", items: [], expectedVersion: 1 });
    expect((await response.json()).review).toMatchObject({ decision: "pending", bindingStatus: "stale" });
  });

  it("returns a recoverable conflict when another edit wins", async () => {
    session.save.mockRejectedValue(new ConflictError("The proposal changed. Reload the current pricing before saving."));
    session.review.mockResolvedValue(null);
    const response = await POST(request({ runId: "run", expectedVersion: 1, pricing: { currency: "USD", items: [] } }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "conflict", message: expect.stringMatching(/Reload/) } });
  });

  it("allows team_member pricing capability and denies client roles", async () => {
    session.save.mockResolvedValue({ id: "p2", version: 2 });
    session.actor = { userId: "team", role: "team_member", clientId: null };
    const response = await POST(request({ runId: "run", expectedVersion: 1, pricing: { currency: "USD", items: [] } }));
    expect(response.status).toBe(200);
    session.actor = { userId: "client", role: "client_admin", clientId: "client" };
    expect((await POST(request({ runId: "run", expectedVersion: 1, pricing: { currency: "USD", items: [] } }))).status).toBe(403);
  });
});
