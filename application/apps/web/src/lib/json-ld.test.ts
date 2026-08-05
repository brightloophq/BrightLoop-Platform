import { describe, it, expect } from "vitest";
import { safeJsonLd } from "./json-ld";

const U2028 = String.fromCharCode(0x2028);
const U2029 = String.fromCharCode(0x2029);

describe("safeJsonLd", () => {
  it("escapes < > & so a </script> breakout is impossible", () => {
    const out = safeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain("&");
    expect(out).toContain("\\u003c");
    expect(out).toContain("\\u003e");
  });

  it("escapes the U+2028 / U+2029 line separators", () => {
    const out = safeJsonLd({ q: `a${U2028}b${U2029}c` });
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
    expect(out).not.toContain(U2028);
    expect(out).not.toContain(U2029);
  });

  it("remains valid JSON that round-trips to the original value", () => {
    const value = { "@type": "Review", body: "5 < 6 & 7 > 2", nested: { a: 1 } };
    expect(JSON.parse(safeJsonLd(value))).toEqual(value);
  });

  it("leaves ordinary content unescaped", () => {
    expect(safeJsonLd({ name: "Auxion" })).toBe('{"name":"Auxion"}');
  });
});
