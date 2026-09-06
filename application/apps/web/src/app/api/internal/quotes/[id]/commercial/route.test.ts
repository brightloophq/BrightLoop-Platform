import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@brightloop/domain";

const state = vi.hoisted(() => ({ actor: null as Actor | null, rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getActor: async () => state.actor }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: state.rpc }) }));

import { POST } from "./route";

const validBody = {
  expectedUpdatedAt: "2026-09-06T00:00:00.000Z",
  title: "Commercial scope",
  clientNote: "",
  currency: "USD",
  discount: 0,
  validUntil: null,
  items: [{ id: "qit_1", label: "Work", description: "Deliver it", quantity: 1, unitAmount: null, pricingType: "one_time", recurrenceCadence: null, optional: false }],
};
const request = (body: unknown = validBody) => new Request("http://localhost/api/internal/quotes/qte_1/commercial", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const context = { params: Promise.resolve({ id: "qte_1" }) };

describe("canonical quote commercial save route", () => {
  beforeEach(() => {
    state.rpc.mockReset();
    state.rpc.mockResolvedValue({ data: [{ quote_id: "qte_1", updated_at: "2026-09-06T00:01:00Z", subtotal: 0, discount: 0, total: 0, recurring_total: 0, recurring_cadence: null, optional_one_time_total: 0, optional_recurring_total: 0, pricing_complete: false, item_count: 1 }], error: null });
  });

  it("requires authentication", async () => {
    state.actor = null;
    expect((await POST(request(), context)).status).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("requires clients.update and denies client/team roles", async () => {
    for (const actor of [
      { userId: "client", role: "client_admin", clientId: "cli_1" },
      { userId: "team", role: "team_member", clientId: null },
    ] satisfies Actor[]) {
      state.actor = actor;
      expect((await POST(request(), context)).status).toBe(403);
    }
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid money and recurrence before the RPC", async () => {
    state.actor = { userId: "owner", role: "owner", clientId: null };
    expect((await POST(request({ ...validBody, currency: "usd" }), context)).status).toBe(400);
    expect((await POST(request({ ...validBody, items: [{ ...validBody.items[0], unitAmount: -1 }] }), context)).status).toBe(400);
    expect((await POST(request({ ...validBody, items: [{ ...validBody.items[0], pricingType: "recurring", recurrenceCadence: null }] }), context)).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("calls the invoker RPC without accepting browser totals or lineage", async () => {
    state.actor = { userId: "owner", role: "owner", clientId: null };
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("bl_save_quote_commercial", expect.objectContaining({
      p_quote_id: "qte_1", p_currency: "USD", p_items: validBody.items,
    }));
    expect(JSON.stringify(state.rpc.mock.calls[0])).not.toContain("sourceWorkItemId");
    expect(JSON.stringify(state.rpc.mock.calls[0])).not.toContain("subtotal");
  });

  it("maps optimistic concurrency conflicts to 409", async () => {
    state.actor = { userId: "admin", role: "admin", clientId: null };
    state.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "Quote was updated by another editor" } });
    expect((await POST(request(), context)).status).toBe(409);
  });
});
