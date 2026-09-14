import { describe, expect, it } from "vitest";
import { freshnessView } from "./evidence-freshness";

const MODIFIED = "2026-09-10T08:30:00.000Z";
const COLLECTED = "2026-09-14T17:01:08.000Z";

describe("freshnessView", () => {
  /**
   * The defect: a static 404 page sends Last-Modified and a dynamic 200 does
   * not, so the failures looked better evidenced than the successes.
   */
  it("does NOT date a page that was never captured, even with a header", () => {
    const view = freshnessView({ state: "unavailable", freshness: MODIFIED, collectedAt: COLLECTED });
    expect(view.label).toBe("not captured");
    expect(view.label).not.toContain("2026");
  });

  it("gives a captured page with no Last-Modified the time we looked", () => {
    const view = freshnessView({ state: "observed", freshness: null, collectedAt: COLLECTED });
    expect(view.label).toBe("seen 2026-09-14 17:01Z");
  });

  it("marks that substitution rather than passing it off as the page's own date", () => {
    const view = freshnessView({ state: "observed", freshness: null, collectedAt: COLLECTED });
    // "seen" is the whole point: it is when WE looked, not when the page changed.
    expect(view.label.startsWith("seen ")).toBe(true);
    expect(view.title).toContain("when the crawler fetched it");
  });

  it("prefers the server's own Last-Modified when there is one", () => {
    const view = freshnessView({ state: "observed", freshness: MODIFIED, collectedAt: COLLECTED });
    expect(view.label).toBe("2026-09-10 08:30Z");
    expect(view.label.startsWith("seen")).toBe(false);
    expect(view.title).toContain("Last-Modified");
  });

  it("trims to the minute — seconds are noise in a ledger", () => {
    expect(freshnessView({ state: "observed", freshness: MODIFIED, collectedAt: null }).label)
      .not.toContain(":00.000");
  });

  it("says unknown only when it genuinely has neither", () => {
    expect(freshnessView({ state: "observed", freshness: null, collectedAt: null }).label).toBe("unknown");
  });

  it("passes through an unparseable timestamp rather than inventing one", () => {
    const view = freshnessView({ state: "observed", freshness: "not a date", collectedAt: null });
    expect(view.label).toBe("not a date");
  });
});
