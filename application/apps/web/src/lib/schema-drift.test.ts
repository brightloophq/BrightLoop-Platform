import { describe, expect, it } from "vitest";
import { errorMessage, looksLikeSchemaDrift, schemaDriftHint } from "./schema-drift";

describe("looksLikeSchemaDrift", () => {
  it("recognises the error that took the Business Scan page down", () => {
    expect(
      looksLikeSchemaDrift(
        'core-surfaces.listFindings failed: column scan_findings.source does not exist',
      ),
    ).toBe(true);
  });

  it("recognises PostgREST's schema-cache wordings", () => {
    for (const message of [
      "Could not find the 'source' column of 'scan_findings' in the schema cache",
      "Could not find the function public.bl_submit_contact_enquiry(p_company, p_email) in the schema cache",
      "Could not find the table 'public.scan_findings' in the schema cache",
    ]) {
      expect(looksLikeSchemaDrift(message)).toBe(true);
    }
  });

  it("recognises a missing relation, type or function", () => {
    expect(looksLikeSchemaDrift('relation "public.leads" does not exist')).toBe(true);
    expect(looksLikeSchemaDrift('type "public.finding_source" does not exist')).toBe(true);
    expect(looksLikeSchemaDrift("function public.bl_x(text) does not exist")).toBe(true);
  });

  it("does NOT claim a migration is missing for every failure", () => {
    // A false positive sends someone to run a migration that is not the
    // problem, which is worse than saying nothing.
    for (const message of [
      "core-surfaces.listFindings failed: permission denied for table scan_findings",
      "TypeError: fetch failed",
      "JWT expired",
      "new row violates row-level security policy",
      "duplicate key value violates unique constraint",
      "",
    ]) {
      expect(looksLikeSchemaDrift(message)).toBe(false);
      expect(schemaDriftHint(message)).toBeNull();
    }
  });
});

describe("schemaDriftHint", () => {
  it("names the command that fixes it", () => {
    const hint = schemaDriftHint("column scan_findings.source does not exist");
    expect(hint).toContain("supabase db push");
  });
});

describe("errorMessage", () => {
  it("reads a thrown Error, a string, and anything else", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("boom")).toBe("boom");
    expect(errorMessage({ weird: true })).toBe("Unknown error");
    expect(errorMessage(undefined)).toBe("Unknown error");
  });
});
