import { describe, it, expect } from "vitest";
import { commercialTermsValid } from "./commercial-review.js";

describe("commercial terms UTC expiry", () => {
  it.each([null, "", "tomorrow", "2026-02-30", "2026-08-08", "2026-08-09T12:00:00Z"])("rejects missing, malformed or expired date %s", (date) => {
    expect(commercialTermsValid(date, "2026-08-09T23:59:59.000Z")).toBe(false);
  });
  it("includes the entire stated UTC day", () => {
    expect(commercialTermsValid("2026-08-09", "2026-08-09T23:59:59.000Z")).toBe(true);
    expect(commercialTermsValid("2026-08-09", "2026-08-10T00:00:00.000Z")).toBe(false);
  });
});
