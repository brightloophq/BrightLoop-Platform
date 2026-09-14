import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  turnstile: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: state.rpc }) }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: state.turnstile }));

const { submitContactEnquiry } = await import("./actions");

function form(over: Record<string, string> = {}): FormData {
  const data = new FormData();
  const fields = {
    name: "Ada Lovelace",
    email: "Ada@Example.Test",
    company: "Analytical Engines",
    message: "We need a site that takes bookings.",
    turnstileToken: "tok",
    ...over,
  };
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("submitContactEnquiry", () => {
  beforeEach(() => {
    state.rpc.mockReset().mockResolvedValue({ data: "lead_abc", error: null });
    state.turnstile.mockReset().mockResolvedValue({ ok: true });
  });

  it("records the enquiry and reports the lead it created", async () => {
    const result = await submitContactEnquiry(form());
    expect(result).toEqual({ ok: true, leadId: "lead_abc" });
    expect(state.rpc).toHaveBeenCalledWith("bl_submit_contact_enquiry", {
      p_name: "Ada Lovelace",
      // Normalised before it reaches the database, so the same person is the
      // same lead however they typed it.
      p_email: "ada@example.test",
      p_company: "Analytical Engines",
      p_message: "We need a site that takes bookings.",
    });
  });

  it("re-runs the form's own rules — a browser is not a trust boundary", async () => {
    const result = await submitContactEnquiry(form({ email: "not-an-email" }));
    expect(result.ok).toBeUndefined();
    expect(result.fieldErrors?.email).toBeTruthy();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses a message too short to act on, without touching the database", async () => {
    const result = await submitContactEnquiry(form({ message: "hi" }));
    expect(result.fieldErrors?.message).toContain("at least");
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("stops at the anti-bot gate before writing anything", async () => {
    state.turnstile.mockResolvedValue({ ok: false, reason: "Anti-bot check failed. Please try again." });
    const result = await submitContactEnquiry(form());
    expect(result.error).toBe("Anti-bot check failed. Please try again.");
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("validates BEFORE spending a Turnstile verification on junk", async () => {
    await submitContactEnquiry(form({ name: "" }));
    expect(state.turnstile).not.toHaveBeenCalled();
  });

  it("passes on the rate limit, which is the one refusal a visitor can act on", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "53400", message: "Too many enquiries" } });
    const result = await submitContactEnquiry(form());
    expect(result.error).toContain("Email us directly");
    expect(result.ok).toBeUndefined();
  });

  it("NEVER shows a database message to a stranger", async () => {
    state.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: 'permission denied for table leads (relation 16421)' },
    });
    const result = await submitContactEnquiry(form());
    expect(result.error).not.toContain("permission denied");
    expect(result.error).not.toContain("leads");
    expect(result.error).toContain("try again");
  });

  it("reports failure rather than a false success when the write returns nothing", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "boom" } });
    expect((await submitContactEnquiry(form())).ok).toBeUndefined();
  });
});
