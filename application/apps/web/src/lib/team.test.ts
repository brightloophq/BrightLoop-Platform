import { describe, expect, it } from "vitest";
import { monogram, seedOf, TEAM, type TeamMember } from "./team";

const seat = (over: Partial<TeamMember> = {}): TeamMember => ({
  id: "x",
  role: "Brand Designer",
  remit: "r",
  discipline: "Brand",
  ...over,
});

describe("the roster", () => {
  it("covers the four seats, each with a role and a remit", () => {
    expect(TEAM).toHaveLength(4);
    for (const member of TEAM) {
      expect(member.role.length).toBeGreaterThan(0);
      expect(member.remit.length).toBeGreaterThan(0);
      expect(member.discipline.length).toBeGreaterThan(0);
    }
  });

  it("uses a unique id per seat, since they are React keys and anchors", () => {
    expect(new Set(TEAM.map((m) => m.id)).size).toBe(TEAM.length);
  });

  /**
   * The About page promises it labels what is unverified. Shipping invented
   * colleagues would break that on the page that makes the promise, so the
   * seats start unnamed and this test keeps that honest by default.
   */
  it("names nobody who has not been confirmed", () => {
    for (const member of TEAM) {
      expect(member.name).toBeUndefined();
    }
  });
});

describe("monogram", () => {
  it("takes first and last initial of a person", () => {
    expect(monogram(seat({ name: "Ada Lovelace" }))).toBe("AL");
  });

  it("ignores middle names", () => {
    expect(monogram(seat({ name: "Ada King Lovelace" }))).toBe("AL");
  });

  it("falls back to the role when the seat is unnamed", () => {
    expect(monogram(seat({ role: "Brand Designer" }))).toBe("BD");
  });

  it("splits on an ampersand, so a compound role does not read as one word", () => {
    expect(monogram(seat({ role: "SEO & Search Lead" }))).toBe("SL");
  });

  it("uses two letters when there is only one word", () => {
    expect(monogram(seat({ name: "Prince" }))).toBe("PR");
  });

  it("survives punctuation and accents rather than emitting them", () => {
    expect(monogram(seat({ name: "Ángel O'Neill" }))).toBe("ÁO");
    expect(monogram(seat({ name: "!!! ???" }))).toBe("A");
  });

  it("never returns an empty string, whatever it is given", () => {
    for (const member of TEAM) {
      expect(monogram(member).length).toBeGreaterThan(0);
    }
  });
});

describe("seedOf", () => {
  /** The plate must be identical on the server and in the browser. */
  it("is deterministic", () => {
    expect(seedOf("founder")).toBe(seedOf("founder"));
  });

  it("separates the seats it is used for", () => {
    const seeds = TEAM.map((m) => seedOf(m.id));
    expect(new Set(seeds).size).toBe(TEAM.length);
  });

  it("stays a non-negative integer, since it indexes and rotates art", () => {
    for (const value of ["", "founder", "a".repeat(500), "Ángel"]) {
      const seed = seedOf(value);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
    }
  });
});
