import { describe, expect, it } from "vitest";
import { classifyError } from "./transport.js";

/** The shape Node's global fetch actually throws: "fetch failed" + a cause. */
function fetchFailed(cause: unknown): TypeError {
  const error = new TypeError("fetch failed");
  (error as { cause?: unknown }).cause = cause;
  return error;
}

function sysError(code: string, message: string): Error {
  const error = new Error(message);
  (error as { code?: string }).code = code;
  return error;
}

describe("classifyError", () => {
  /**
   * The defect this exists for: a crawl of nine pages reported nine
   * "unknown" reasons, because only the OUTER message was read and undici's
   * outer message is always the fixed string "fetch failed".
   */
  it("reads the cause, not the useless outer 'fetch failed'", () => {
    const result = classifyError(
      fetchFailed(sysError("ENOTFOUND", "getaddrinfo ENOTFOUND zeevents.com")),
    );
    expect(result.kind).toBe("dns");
    expect(result.kind).not.toBe("unknown");
  });

  it("keeps the real detail in the message, so it can be searched for", () => {
    const result = classifyError(
      fetchFailed(sysError("ENOTFOUND", "getaddrinfo ENOTFOUND zeevents.com")),
    );
    expect(result.message).toContain("ENOTFOUND");
    expect(result.message).toContain("zeevents.com");
  });

  /* ---- each kind, by the code Node actually sets -------------------------- */

  it("classifies a refused connection", () => {
    expect(classifyError(fetchFailed(sysError("ECONNREFUSED", "connect ECONNREFUSED 1.2.3.4:443"))).kind)
      .toBe("connect");
  });

  it("classifies undici's own connect timeout", () => {
    expect(classifyError(fetchFailed(sysError("UND_ERR_CONNECT_TIMEOUT", "Connect Timeout Error"))).kind)
      .toBe("timeout");
  });

  it("classifies an expired certificate", () => {
    expect(classifyError(fetchFailed(sysError("CERT_HAS_EXPIRED", "certificate has expired"))).kind)
      .toBe("tls");
  });

  it("classifies a hostname mismatch as tls, not connect", () => {
    expect(
      classifyError(fetchFailed(sysError("ERR_TLS_CERT_ALTNAME_INVALID", "Hostname/IP does not match"))).kind,
    ).toBe("tls");
  });

  it("classifies an unreachable network", () => {
    expect(classifyError(fetchFailed(sysError("EHOSTUNREACH", "connect EHOSTUNREACH"))).kind)
      .toBe("connect");
  });

  /* ---- the awkward real-world shapes -------------------------------------- */

  it("unwraps an AggregateError, which is what a multi-address host throws", () => {
    // A host with several A records fails once per address; the aggregate's own
    // message says nothing at all.
    const aggregate = new AggregateError(
      [sysError("ECONNREFUSED", "connect ECONNREFUSED 1.1.1.1:443"),
       sysError("ECONNREFUSED", "connect ECONNREFUSED 2.2.2.2:443")],
      "",
    );
    expect(classifyError(fetchFailed(aggregate)).kind).toBe("connect");
  });

  it("walks more than one level of cause", () => {
    expect(classifyError(fetchFailed(fetchFailed(sysError("ENOTFOUND", "getaddrinfo ENOTFOUND x")))).kind)
      .toBe("dns");
  });

  it("does not hang on a circular cause chain", () => {
    const a = new Error("a");
    const b = new Error("b");
    (a as { cause?: unknown }).cause = b;
    (b as { cause?: unknown }).cause = a;
    expect(classifyError(a).kind).toBe("unknown");
  });

  /* ---- precedence --------------------------------------------------------- */

  it("treats our OWN abort as a timeout, whatever the socket says afterwards", () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    (abort as { cause?: unknown }).cause = sysError("ECONNRESET", "socket hang up");
    expect(classifyError(abort).kind).toBe("timeout");
    expect(classifyError(abort).message).toBe("request timed out");
  });

  /* ---- the honest fallback ------------------------------------------------ */

  it("still says unknown when it genuinely cannot tell", () => {
    expect(classifyError(fetchFailed(new Error("something entirely new"))).kind).toBe("unknown");
  });

  it("carries the deepest real message rather than repeating 'fetch failed'", () => {
    const result = classifyError(fetchFailed(new Error("something entirely new")));
    expect(result.message).toContain("something entirely new");
  });

  it("handles a non-Error cause without throwing", () => {
    expect(classifyError("just a string").kind).toBe("unknown");
    expect(classifyError(undefined).kind).toBe("unknown");
  });
});

describe("classifyError · the code that makes a kind actionable", () => {
  /**
   * Three failures share the kind "timeout" and mean entirely different things.
   * Storing only the kind — which is what the page row did — collapses them.
   */
  it("distinguishes a connect timeout from a headers timeout", () => {
    const connect = classifyError(fetchFailed(sysError("UND_ERR_CONNECT_TIMEOUT", "Connect Timeout Error")));
    const headers = classifyError(fetchFailed(sysError("UND_ERR_HEADERS_TIMEOUT", "Headers Timeout Error")));

    expect(connect.kind).toBe("timeout");
    expect(headers.kind).toBe("timeout");
    // Same kind, different cause: one never reached the host, the other was
    // accepted and then ignored.
    expect(connect.code).toBe("UND_ERR_CONNECT_TIMEOUT");
    expect(headers.code).toBe("UND_ERR_HEADERS_TIMEOUT");
  });

  it("marks OUR OWN abort so it is not mistaken for the host stalling", () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    expect(classifyError(abort).code).toBe("CRAWLER_TIMEOUT");
  });

  it("carries the code for every classified kind", () => {
    expect(classifyError(fetchFailed(sysError("ENOTFOUND", "getaddrinfo ENOTFOUND x"))).code).toBe("ENOTFOUND");
    expect(classifyError(fetchFailed(sysError("ECONNREFUSED", "connect ECONNREFUSED"))).code).toBe("ECONNREFUSED");
    expect(classifyError(fetchFailed(sysError("CERT_HAS_EXPIRED", "certificate has expired"))).code).toBe("CERT_HAS_EXPIRED");
  });

  it("leaves the code empty rather than inventing one", () => {
    expect(classifyError(fetchFailed(new Error("something entirely new"))).code).toBe("");
  });
});
