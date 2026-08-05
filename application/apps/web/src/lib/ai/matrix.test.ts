import { describe, it, expect } from "vitest";
import { AI_ROUTES, lookupAiAction, actionDefs, routeHasLiveAi, type AiRoute } from "./matrix";

describe("AI route matrix", () => {
  it("lookupAiAction resolves known actions and rejects unknown", () => {
    expect(lookupAiAction("console", "summarize-today")?.status).toBe("advisory");
    expect(lookupAiAction("signals", "explain-signal")?.status).toBe("future");
    expect(lookupAiAction("console", "nope")).toBeUndefined();
  });

  it("actionDefs strips server-only meta (no permission/status leak to the client)", () => {
    for (const def of actionDefs("console")) {
      expect(Object.keys(def).sort()).toEqual(["icon", "key", "kind", "label"]);
    }
  });

  it("routeHasLiveAi: true when a route has advisory/supported actions, false when all future", () => {
    expect(routeHasLiveAi("console")).toBe(true); // advisory
    expect(routeHasLiveAi("approvals")).toBe(true); // advisory
    expect(routeHasLiveAi("signals")).toBe(false); // all future
    expect(routeHasLiveAi("analytics")).toBe(false); // all future
  });

  it("every action is well-formed and future actions carry a reason", () => {
    const routes = Object.keys(AI_ROUTES) as AiRoute[];
    for (const r of routes) {
      for (const a of AI_ROUTES[r]) {
        expect(a.label.length).toBeGreaterThan(0);
        expect(["summary", "explanation", "risk", "recommendation", "comparison", "forecast", "action-plan"]).toContain(a.kind);
        if (a.status === "future") expect((a.futureReason ?? "").length).toBeGreaterThan(0);
      }
    }
  });
});
