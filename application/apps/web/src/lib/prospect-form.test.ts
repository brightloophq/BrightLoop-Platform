/* =============================================================================
 * Prospect scan form validation tests (Phase C · Sprint C4 §17).
 *
 * Pure — no network, no provider, no DOM. Proves the form rejects exactly what
 * the C3 crawler would refuse to fetch, so an operator is told immediately
 * rather than three stages later.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { parseProspectScanForm, MAX_PAGES_MAX, MAX_PAGES_DEFAULT } from "./prospect-form";

function form(overrides: Record<string, string> = {}, omit: string[] = []): FormData {
  const base: Record<string, string> = {
    subject: "client:t_acme",
    websiteUrl: "https://example.com",
    businessName: "Example Co",
    maxPages: "5",
    reasoningMode: "standard",
    costAcknowledged: "yes",
    scanAuthorized: "yes",
    ...overrides,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(base)) {
    if (omit.includes(k) || v === "") continue;
    fd.set(k, v);
  }
  return fd;
}

describe("happy path", () => {
  it("accepts a valid request and canonicalizes the URL", () => {
    const result = parseProspectScanForm(form());
    expect(result.ok).toBe(true);
    expect(result.value?.rootUrl).toBe("https://example.com");
    expect(result.value?.clientId).toBe("t_acme");
  });

  it("accepts an explicit lead subject", () => {
    const result = parseProspectScanForm(form({ subject: "lead:lead_acme" }));
    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({ leadId: "lead_acme" });
    expect(result.value).not.toHaveProperty("clientId");
  });

  it("adds a missing scheme rather than rejecting", () => {
    const result = parseProspectScanForm(form({ websiteUrl: "example.com" }));
    expect(result.ok).toBe(true);
    expect(result.value?.rootUrl).toBe("https://example.com");
  });

  it("strips www and a trailing path to the canonical root", () => {
    const result = parseProspectScanForm(form({ websiteUrl: "https://www.example.com/pricing" }));
    expect(result.value?.rootUrl).toBe("https://example.com");
  });

  it("builds a metadata envelope the crawler can read", () => {
    const result = parseProspectScanForm(form({ businessName: "Acme", industry: "Retail", location: "Kingston", notes: "Warm lead" }));
    expect(result.value?.metadata).toMatchObject({
      rootUrl: "https://example.com",
      maxPages: 5,
      reasoningMode: "standard",
      businessName: "Acme",
      industry: "Retail",
      location: "Kingston",
      notes: "Warm lead",
      source: "internal_prospect_scanner",
    });
  });

  it("omits empty optional fields from metadata entirely", () => {
    const result = parseProspectScanForm(form({}, ["businessName"]));
    expect(result.ok).toBe(true);
    expect(result.value?.metadata).not.toHaveProperty("businessName");
    expect(result.value?.metadata).not.toHaveProperty("notes");
  });

  it("defaults the page limit when omitted", () => {
    const result = parseProspectScanForm(form({}, ["maxPages"]));
    expect(result.value?.metadata["maxPages"]).toBe(MAX_PAGES_DEFAULT);
  });
});

describe("URL validation", () => {
  it("requires a URL", () => {
    const result = parseProspectScanForm(form({}, ["websiteUrl"]));
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.["websiteUrl"]).toMatch(/required/i);
  });

  it.each(["ftp://example.com", "file:///etc/passwd"])("rejects the unsupported scheme %s", (url) => {
    const result = parseProspectScanForm(form({ websiteUrl: url }));
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.["websiteUrl"]).toBeDefined();
  });

  it("rejects credentials embedded in the URL", () => {
    const result = parseProspectScanForm(form({ websiteUrl: "https://user:pass@example.com" }));
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.["websiteUrl"]).toMatch(/credentials/i);
  });

  it.each([
    ["http://localhost", "localhost"],
    ["http://127.0.0.1", "loopback"],
    ["http://10.0.0.5", "rfc1918"],
    ["http://192.168.1.1", "rfc1918"],
    ["http://172.16.4.4", "rfc1918"],
    ["http://169.254.169.254", "link-local"],
    ["http://0.0.0.0", "unspecified"],
  ])("rejects the private/local address %s (%s)", (url) => {
    const result = parseProspectScanForm(form({ websiteUrl: url }));
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.["websiteUrl"]).toMatch(/private or local/i);
  });

  it("rejects a URL longer than the field limit", () => {
    const result = parseProspectScanForm(form({ websiteUrl: `https://example.com/${"a".repeat(400)}` }));
    expect(result.ok).toBe(false);
  });
});

describe("field rules", () => {
  it("rejects angle brackets in free text (no arbitrary HTML)", () => {
    const result = parseProspectScanForm(form({ notes: "<script>alert(1)</script>" }));
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.["notes"]).toMatch(/angle brackets/i);
  });

  it("rejects an over-long note", () => {
    const result = parseProspectScanForm(form({ notes: "a".repeat(2001) }));
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.["notes"]).toMatch(/under 2000/i);
  });

  it("rejects a malformed email but allows an absent one", () => {
    expect(parseProspectScanForm(form({ email: "not-an-email" })).ok).toBe(false);
    expect(parseProspectScanForm(form({}, ["email"])).ok).toBe(true);
  });

  it("rejects a page limit outside the allowed range", () => {
    expect(parseProspectScanForm(form({ maxPages: "0" })).ok).toBe(false);
    expect(parseProspectScanForm(form({ maxPages: String(MAX_PAGES_MAX + 1) })).ok).toBe(false);
    expect(parseProspectScanForm(form({ maxPages: "2.5" })).ok).toBe(false);
  });

  it("rejects an unknown reasoning mode", () => {
    expect(parseProspectScanForm(form({ reasoningMode: "wild" })).ok).toBe(false);
  });

  it("requires an explicit client or lead subject", () => {
    const result = parseProspectScanForm(form({}, ["subject"]));
    expect(result.fieldErrors?.["subject"]).toBeDefined();
  });
});

describe("acknowledgements", () => {
  it("requires the cost acknowledgement", () => {
    const result = parseProspectScanForm(form({}, ["costAcknowledged"]));
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.["costAcknowledged"]).toMatch(/cost/i);
  });

  it("requires the scan authorization", () => {
    const result = parseProspectScanForm(form({}, ["scanAuthorized"]));
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.["scanAuthorized"]).toMatch(/authorized/i);
  });

  it("reports every failing field at once", () => {
    const result = parseProspectScanForm(form({ websiteUrl: "" }, ["websiteUrl", "costAcknowledged", "scanAuthorized"]));
    expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual(["costAcknowledged", "scanAuthorized", "websiteUrl"]);
  });
});
