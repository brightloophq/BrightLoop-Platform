import { describe, expect, it } from "vitest";
import { classifyError } from "./transport.js";

/**
 * Against REAL Node failures, not hand-built errors. The defect being fixed was
 * precisely a mismatch between the error shape that was imagined and the one
 * Node throws, so at least one test has to use the real thing.
 */
describe("classifyError · real fetch failures", () => {
  it("classifies a genuine DNS failure as dns", async () => {
    let caught: unknown;
    try {
      await fetch("https://nonexistent-host-xyz-12345.invalid/");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    const result = classifyError(caught);
    expect(result.kind).toBe("dns");
  });

  it("classifies a genuine refused connection as connect", async () => {
    let caught: unknown;
    try {
      // A high loopback port nothing listens on. NOT port 9: undici keeps a
      // blocked-ports list and refuses that one as "bad port" before it ever
      // attempts a connection, which is a different failure entirely.
      await fetch("http://127.0.0.1:49517/");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(classifyError(caught).kind).toBe("connect");
  });
});
