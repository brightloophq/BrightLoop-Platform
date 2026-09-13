import { describe, expect, it } from "vitest";
import { explainAdminLoadError } from "./admin-error";

describe("explainAdminLoadError", () => {
  /**
   * The case that prompted this module: a Gateway Timeout was shown to the
   * owner with a sentence about JWT roles appended, pointing them at auth
   * configuration when the database had simply not answered.
   */
  it("does NOT blame permissions for a Gateway Timeout", () => {
    const hint = explainAdminLoadError({ message: "Gateway Timeout" });
    expect(hint).toBeDefined();
    expect(hint).toContain("did not answer in time");
    expect(hint).toContain("not a permissions problem");
    expect(hint).not.toContain("access token hook");
  });

  it("points a timeout at the Supabase dashboard and a refresh", () => {
    const hint = explainAdminLoadError({ message: "Gateway Timeout" })!;
    expect(hint).toContain("Supabase dashboard");
    expect(hint).toContain("refreshing");
  });

  it("recognises a statement timeout by its Postgres code", () => {
    expect(explainAdminLoadError({ message: "canceling statement due to statement timeout", code: "57014" }))
      .toContain("did not answer in time");
  });

  it("explains a real permissions refusal, and only then mentions the token hook", () => {
    const hint = explainAdminLoadError({ message: 'permission denied for table portfolio_projects' })!;
    expect(hint).toContain("permissions refusal");
    expect(hint).toContain("custom access token hook");
  });

  it("recognises a permissions refusal by its Postgres code", () => {
    expect(explainAdminLoadError({ message: "nope", code: "42501" })).toContain("permissions refusal");
  });

  it("recognises an RLS violation", () => {
    expect(explainAdminLoadError({ message: "new row violates row-level security policy" }))
      .toContain("permissions refusal");
  });

  it("tells an expired session to sign in again", () => {
    expect(explainAdminLoadError({ message: "JWT expired" })).toContain("Sign out and back in");
    expect(explainAdminLoadError({ message: "whatever", code: "PGRST301" })).toContain("expired");
  });

  it("distinguishes unreachable from slow", () => {
    const hint = explainAdminLoadError({ message: "fetch failed" })!;
    expect(hint).toContain("could not be reached");
    expect(hint).toContain("Supabase URL and key");
  });

  it("prefers the permissions reading when a message could be read either way", () => {
    // Both words appear; "permission denied" is the specific, actionable one.
    const hint = explainAdminLoadError({ message: "permission denied after timeout" })!;
    expect(hint).toContain("permissions refusal");
  });

  it("adds NOTHING when it cannot honestly explain the error", () => {
    expect(explainAdminLoadError({ message: "duplicate key value violates unique constraint" }))
      .toBeUndefined();
    expect(explainAdminLoadError({ message: "" })).toBeUndefined();
  });

  it("is case-insensitive about the message", () => {
    expect(explainAdminLoadError({ message: "GATEWAY TIMEOUT" })).toContain("did not answer");
    expect(explainAdminLoadError({ message: "Permission Denied" })).toContain("permissions refusal");
  });
});
