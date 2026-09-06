import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@brightloop/domain";

const state = vi.hoisted(() => ({ actor: null as Actor | null, rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getActor: async () => state.actor }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data: { id: "evt_3", event_type: "runtime.review.approved", payload: { proposalVersionId: "prop_2", proposalChecksum: "sum" } }, error: null }),
    };
    return { from: () => query, rpc: state.rpc };
  },
}));

import { POST } from "./route";

const request = () => new Request("http://localhost/api/internal/runtime/package-promotion", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ runId: "run_1" }),
});

describe("package promotion route", () => {
  beforeEach(() => {
    state.rpc.mockReset();
    state.rpc.mockResolvedValue({ data: [{ quote_id: "qte_1", outcome: "created", item_count: 2 }], error: null });
  });

  it("requires an authenticated actor", async () => {
    state.actor = null;
    expect((await POST(request())).status).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("denies a client role before touching the RPC", async () => {
    state.actor = { userId: "client", role: "client_admin", clientId: "cli_1" };
    expect((await POST(request())).status).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("requires both review authority and clients.update", async () => {
    state.actor = { userId: "team", role: "team_member", clientId: null };
    expect((await POST(request())).status).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("calls the invoker RPC with deterministic provenance coordinates", async () => {
    state.actor = { userId: "owner", role: "owner", clientId: null };
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("bl_promote_scanner_package", expect.objectContaining({
      p_run_id: "run_1",
      p_proposal_version_id: "prop_2",
      p_review_event_id: "evt_3",
      p_promotion_key: "promo:run_1:prop_2:evt_3",
    }));
    expect(await response.json()).toEqual({ quoteId: "qte_1", outcome: "created", itemCount: 2 });
  });
});
