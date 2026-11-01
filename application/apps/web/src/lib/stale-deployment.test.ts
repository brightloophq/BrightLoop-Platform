import { describe, expect, it } from "vitest";
import {
  actionErrorMessage,
  looksLikeStaleDeployment,
  staleDeploymentHint,
} from "./stale-deployment";

/** The message Next actually produced, verbatim from the reported failure. */
const REAL =
  'Server Action "40e24abffc48c36de7c5c3db963b71aacdde63d464" was not found on the server. Read more: https://nextjs.org/docs/messages/failed-to-find-server-action';

describe("looksLikeStaleDeployment", () => {
  it("recognises the message from the reported failure", () => {
    expect(looksLikeStaleDeployment(REAL)).toBe(true);
  });

  it("recognises it without the docs link, and regardless of case", () => {
    expect(looksLikeStaleDeployment('Server Action "abc" was not found on the server.')).toBe(true);
    expect(looksLikeStaleDeployment('server action "abc" WAS NOT FOUND ON THE SERVER')).toBe(true);
  });

  /** Telling someone to reload when reloading cannot help is worse than silence. */
  it("does not claim unrelated failures are stale builds", () => {
    for (const message of [
      "Failed to fetch",
      "The resource was not found on the server",
      "Server Action failed: permission denied",
      "new row violates row-level security policy",
      "Payload too large",
      "",
    ]) {
      expect(looksLikeStaleDeployment(message)).toBe(false);
    }
  });
});

describe("staleDeploymentHint", () => {
  it("says to reload, and that nothing was lost", () => {
    const hint = staleDeploymentHint(REAL);
    expect(hint).toBeTruthy();
    expect(hint).toMatch(/reload/i);
    expect(hint).toMatch(/lost/i);
  });

  it("never mentions the hash or the framework", () => {
    const hint = staleDeploymentHint(REAL) ?? "";
    expect(hint).not.toContain("40e24abf");
    expect(hint).not.toMatch(/nextjs\.org|Server Action/i);
  });

  it("is null for anything else", () => {
    expect(staleDeploymentHint("Upload failed")).toBeNull();
  });
});

describe("actionErrorMessage", () => {
  it("replaces the stale-build error with the readable hint", () => {
    expect(actionErrorMessage(new Error(REAL), "Upload failed. Try again.")).toMatch(/reload/i);
  });

  /** Every other error still reaches the person unchanged — this hides nothing. */
  it("passes a real error through untouched", () => {
    expect(actionErrorMessage(new Error("Supabase returned no upload token."), "fallback")).toBe(
      "Supabase returned no upload token.",
    );
  });

  it("falls back when the thrown value carries no message", () => {
    expect(actionErrorMessage(new Error(""), "Upload failed. Try again.")).toBe("Upload failed. Try again.");
    expect(actionErrorMessage(undefined, "Upload failed. Try again.")).toBe("Upload failed. Try again.");
    expect(actionErrorMessage({ weird: true }, "fallback")).toBe("fallback");
  });

  it("accepts a thrown string", () => {
    expect(actionErrorMessage("plain failure", "fallback")).toBe("plain failure");
  });
});
