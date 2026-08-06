/* =============================================================================
 * TEMPORARY diagnostic instrumentation tests ([AUXION_REASONING_DIAGNOSTIC]).
 *
 * Proves the SAFETY properties of the flag-gated production diagnostic: it is
 * inert by default, bounded + redacted when enabled, and behaviour-neutral either
 * way. Delete alongside the instrumentation after the single diagnostic run.
 * ========================================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeResponse, MalformedOutputError } from "./normalize.js";
import type { TransportResult } from "./transport.js";

const FLAG = "AUXION_REASONING_DIAGNOSTIC";
const TAG = "[AUXION_REASONING_DIAGNOSTIC]";

const result = (over: Partial<TransportResult> = {}): TransportResult => ({
  text: JSON.stringify({ ok: true }),
  stopReason: "end_turn",
  usage: { inputTokens: 100, outputTokens: 50 },
  model: "claude-opus-4-8",
  requestId: "req_123",
  latencyMs: 1200,
  ...over,
});

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  delete process.env[FLAG];
});
afterEach(() => {
  warnSpy.mockRestore();
  delete process.env[FLAG];
});

function diagPayload(): Record<string, unknown> | null {
  const call = warnSpy.mock.calls.find((c) => c[0] === TAG);
  return call ? (JSON.parse(call[1] as string) as Record<string, unknown>) : null;
}

describe("reasoning diagnostic — flag gating", () => {
  it("emits NO log when the flag is unset (the default)", () => {
    normalizeResponse({ result: result(), providerId: "anthropic-primary" });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("emits NO log when the flag is present but not exactly 'true'", () => {
    process.env[FLAG] = "1";
    normalizeResponse({ result: result(), providerId: "anthropic-primary" });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("emits exactly one tagged log when the flag is 'true'", () => {
    process.env[FLAG] = "true";
    normalizeResponse({ result: result(), providerId: "anthropic-primary" });
    const p = diagPayload();
    expect(p).not.toBeNull();
    expect(p!["stopReason"]).toBe("end_turn");
    expect(p!["jsonParseSucceeded"]).toBe(true);
    expect(p!["outputTokens"]).toBe(50);
  });
});

describe("reasoning diagnostic — bounded + redacted", () => {
  it("bounds head/tail excerpts to 500 characters and records the parse failure", () => {
    process.env[FLAG] = "true";
    const big = "x".repeat(5000);
    expect(() => normalizeResponse({ result: result({ text: big }), providerId: "p" })).toThrow(MalformedOutputError);
    const p = diagPayload()!;
    expect((p["bodyHead500"] as string).length).toBeLessThanOrEqual(500);
    expect((p["bodyTail500"] as string).length).toBeLessThanOrEqual(500);
    expect(p["jsonParseSucceeded"]).toBe(false);
    expect(p["responseCharLength"]).toBe(5000);
  });

  it("redacts emails, bearer tokens and keys from the excerpts", () => {
    process.env[FLAG] = "true";
    const text = JSON.stringify({ note: "reach a@b.com", auth: "Bearer abc.def.ghijk", key: "sk-ant-SECRET123456789" });
    normalizeResponse({ result: result({ text }), providerId: "p" });
    const p = diagPayload()!;
    const blob = `${p["bodyHead500"]}${p["bodyTail500"]}`;
    expect(blob).not.toContain("a@b.com");
    expect(blob).not.toContain("sk-ant-SECRET123456789");
    expect(blob).not.toContain("abc.def.ghijk");
    expect(blob).toContain("[redacted-email]");
  });
});

describe("reasoning diagnostic — behaviour neutral", () => {
  it("returns identical output whether the flag is off or on (valid JSON)", () => {
    const r = result({ text: JSON.stringify({ a: 1, b: "two" }) });
    const off = normalizeResponse({ result: r, providerId: "p" });
    process.env[FLAG] = "true";
    const on = normalizeResponse({ result: r, providerId: "p" });
    expect(on.output).toEqual(off.output);
    expect(on.finishReason).toEqual(off.finishReason);
  });

  it("still throws MalformedOutputError on bad JSON with the flag on (parse path unchanged)", () => {
    process.env[FLAG] = "true";
    expect(() => normalizeResponse({ result: result({ text: "not json at all" }), providerId: "p" })).toThrow(MalformedOutputError);
  });
});
