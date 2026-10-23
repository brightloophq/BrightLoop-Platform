import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@brightloop/domain";
import type { CommercialReviewBinding } from "@brightloop/schema";
import type * as ApplicationModule from "@brightloop/application";
import { ConflictError } from "@brightloop/application";

const session = vi.hoisted(() => ({ actor: null as Actor | null, decide: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getActor: async () => session.actor }));
vi.mock("@/lib/runtime-api", () => ({ buildAppContext: async () => ({ actor: session.actor }) }));
vi.mock("@brightloop/application", async (original) => ({
  ...await original<typeof ApplicationModule>(), decideProspectPackage: session.decide,
}));
import { POST } from "./route";

const ref = (id: string) => ({ id, version: 1, checksum: id });
const expectedBinding: CommercialReviewBinding = {
  schemaVersion: 1, proposal: ref("p"), narrative: ref("n"), report: ref("r"), competitor: null, coreProposal: null,
};
const request = (body: unknown) => new Request("http://localhost/api/internal/runtime/package-review", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => {
  session.actor = { userId: "owner", role: "owner", clientId: null };
  session.decide.mockReset();
});

describe("version-bound package review API", () => {
  it("rejects unauthenticated requests", async () => {
    session.actor = null;
    expect((await POST(request({}))).status).toBe(401);
  });
  it.each(["team_member", "client_admin"] as const)("denies %s despite submitted owner role", async (role) => {
    session.actor = { userId: "other", role, clientId: role === "client_admin" ? "client" : null };
    expect((await POST(request({ runId: "run", action: "approve", expectedBinding, role: "owner" }))).status).toBe(403);
    expect(session.decide).not.toHaveBeenCalled();
  });
  it.each([undefined, null, { ...expectedBinding, proposal: { id: "p" } }])("requires a complete expected binding", async (binding) => {
    expect((await POST(request({ runId: "run", action: "approve", expectedBinding: binding }))).status).toBe(422);
    expect(session.decide).not.toHaveBeenCalled();
  });
  it("returns a recoverable conflict for a stale package", async () => {
    session.decide.mockRejectedValue(new ConflictError("The package changed. Reload and review the current versions."));
    const response = await POST(request({ runId: "run", action: "approve", expectedBinding }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "conflict", message: expect.stringMatching(/Reload/) } });
  });
  it("forwards only the expected identities as a precondition, never a submitted reviewer", async () => {
    session.decide.mockResolvedValue({ decision: "approved", bindingStatus: "current" });
    const response = await POST(request({ runId: "run", action: "approve", expectedBinding, by: "forged", clientReady: true }));
    expect(response.status).toBe(200);
    expect(session.decide).toHaveBeenCalledWith(expect.anything(), "run", { action: "approve", expectedBinding });
  });
});
