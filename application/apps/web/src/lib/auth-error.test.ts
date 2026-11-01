import { describe, expect, it } from "vitest";
import { GENERIC_CREDENTIAL_ERROR, explainSignInError } from "./auth-error";

describe("explainSignInError", () => {
  /**
   * The case that prompted this module: the database was timing out, and the
   * owner was told their password was wrong.
   */
  it("does NOT blame the password for a gateway timeout", () => {
    const message = explainSignInError({ message: "Gateway Timeout", status: 504 });
    expect(message).toContain("not your password");
    expect(message).toContain("Supabase dashboard");
    expect(message).not.toContain("incorrect");
  });

  it("treats any 5xx as the service failing, not the credentials", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(explainSignInError({ message: "boom", status })).toContain("not your password");
    }
  });

  it("distinguishes unreachable from slow", () => {
    const message = explainSignInError({ message: "fetch failed" });
    expect(message).toContain("couldn't reach the database at all");
    expect(message).toContain("Supabase URL and key");
  });

  it("names rate limiting, and says the password has not changed", () => {
    const message = explainSignInError({ message: "Request rate limit reached", status: 429 });
    expect(message).toContain("Too many sign-in attempts");
    expect(message).toContain("password has not changed");
  });

  it("recognises rate limiting by Supabase's machine code", () => {
    expect(explainSignInError({ message: "nope", code: "over_request_rate_limit" })).toContain(
      "Too many sign-in attempts",
    );
  });

  it("checks rate limiting BEFORE anything else, since repeated correct attempts hit it too", () => {
    // A 429 that also mentions credentials must still read as a rate limit —
    // otherwise a locked-out user resets a password that was never wrong.
    const message = explainSignInError({
      message: "invalid login credentials — rate limit",
      status: 429,
    });
    expect(message).toContain("Too many sign-in attempts");
  });

  /* ---- the enumeration guarantee ------------------------------------------ */

  it("gives ONE identical message for a wrong password and an unknown address", () => {
    const wrongPassword = explainSignInError({
      message: "Invalid login credentials",
      status: 400,
    });
    const noSuchAccount = explainSignInError({ message: "Invalid login credentials", status: 400 });
    expect(wrongPassword).toBe(GENERIC_CREDENTIAL_ERROR);
    expect(wrongPassword).toBe(noSuchAccount);
  });

  it("does not reveal an unconfirmed account, which would confirm it exists", () => {
    const message = explainSignInError({ message: "Email not confirmed", status: 400 });
    expect(message).toBe(GENERIC_CREDENTIAL_ERROR);
    // The generic text mentions confirmation for EVERYONE, so it leaks nothing
    // while still pointing an unconfirmed user at the right thing.
    expect(message).toContain("confirming");
  });

  it("falls back to the generic message for anything unrecognised", () => {
    expect(explainSignInError({ message: "" })).toBe(GENERIC_CREDENTIAL_ERROR);
    expect(explainSignInError({ message: "something odd", status: 400 })).toBe(
      GENERIC_CREDENTIAL_ERROR,
    );
  });

  it("is case-insensitive", () => {
    expect(explainSignInError({ message: "GATEWAY TIMEOUT" })).toContain("not your password");
    expect(explainSignInError({ message: "RATE LIMIT reached" })).toContain("Too many");
  });
});
