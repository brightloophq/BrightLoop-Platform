import { describe, it, expect } from "vitest";
import { resultTone, formatConfidence, isBusy, activeKey, canRetry, canCopy } from "./state";
import type { AiActionOutcome, AiResult } from "./types";

const result = (over: Partial<AiResult> = {}): AiResult => ({
  kind: "summary",
  title: "T",
  body: "Body text",
  evidence: [],
  generatedAt: "2026-08-05T00:00:00.000Z",
  advisory: true,
  demo: false,
  ...over,
});

describe("resultTone", () => {
  it("maps kinds to tones", () => {
    expect(resultTone("risk")).toBe("critical");
    expect(resultTone("forecast")).toBe("caution");
    expect(resultTone("recommendation")).toBe("positive");
    expect(resultTone("action-plan")).toBe("positive");
    expect(resultTone("summary")).toBe("info");
    expect(resultTone("explanation")).toBe("info");
    expect(resultTone("comparison")).toBe("info");
  });
});

describe("formatConfidence", () => {
  it("formats and clamps", () => {
    expect(formatConfidence(0.82)).toBe("82% confidence");
    expect(formatConfidence(1.4)).toBe("100% confidence");
    expect(formatConfidence(-1)).toBe("0% confidence");
    expect(formatConfidence(undefined)).toBeNull();
  });
});

describe("view-state helpers", () => {
  it("isBusy / activeKey track phase", () => {
    expect(isBusy({ phase: "idle" })).toBe(false);
    expect(isBusy({ phase: "loading", actionKey: "x" })).toBe(true);
    expect(activeKey({ phase: "idle" })).toBeNull();
    expect(activeKey({ phase: "loading", actionKey: "x" })).toBe("x");
    expect(activeKey({ phase: "done", actionKey: "y", outcome: { status: "ok", result: result() } })).toBe("y");
  });
});

describe("canRetry", () => {
  it("errors and transient unavailability retry; denied + future-phase do not", () => {
    expect(canRetry({ status: "error", message: "boom" })).toBe(true);
    expect(canRetry({ status: "unavailable", reason: "r", futurePhase: false })).toBe(true);
    expect(canRetry({ status: "unavailable", reason: "r", futurePhase: true })).toBe(false);
    expect(canRetry({ status: "denied", message: "no" })).toBe(false);
    expect(canRetry({ status: "ok", result: result() })).toBe(false);
  });
});

describe("canCopy", () => {
  it("only successful non-empty results", () => {
    const ok: AiActionOutcome = { status: "ok", result: result({ body: "hello" }) };
    expect(canCopy(ok)).toBe(true);
    expect(canCopy({ status: "ok", result: result({ body: "   " }) })).toBe(false);
    expect(canCopy({ status: "error", message: "x" })).toBe(false);
  });
});
