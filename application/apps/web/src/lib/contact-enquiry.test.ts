import { describe, expect, it } from "vitest";
import {
  LIMITS,
  firstEnquiryError,
  normaliseEnquiry,
  validateEnquiry,
  type ContactEnquiryInput,
} from "./contact-enquiry";

const valid: ContactEnquiryInput = {
  name: "Ada Lovelace",
  email: "ada@example.test",
  company: "Analytical Engines",
  message: "We need a site that takes bookings.",
};

const enquiry = (over: Partial<ContactEnquiryInput> = {}): ContactEnquiryInput => ({ ...valid, ...over });

describe("normaliseEnquiry", () => {
  it("stores what the reader typed, trimmed", () => {
    expect(normaliseEnquiry(enquiry({ name: "  Ada  ", message: "  A real message here.  " }))).toMatchObject({
      name: "Ada",
      message: "A real message here.",
    });
  });

  it("lower-cases the address, so the same person is the same lead", () => {
    expect(normaliseEnquiry(enquiry({ email: "  Ada@Example.Test " })).email).toBe("ada@example.test");
  });
});

describe("validateEnquiry", () => {
  it("accepts a complete enquiry", () => {
    expect(validateEnquiry(valid)).toEqual({});
  });

  it("accepts one with no company — a sole trader has none", () => {
    expect(validateEnquiry(enquiry({ company: "" }))).toEqual({});
  });

  it("requires a name", () => {
    expect(validateEnquiry(enquiry({ name: "   " })).name).toBe("Enter your name");
  });

  it("requires an address that could be delivered to", () => {
    for (const email of ["", "   ", "not-an-email", "two@@at.test", "no at sign", "missing@domain"]) {
      expect(validateEnquiry(enquiry({ email })).email).toBeTruthy();
    }
  });

  it("accepts the awkward addresses that are real", () => {
    for (const email of ["a+tag@example.co.uk", "first.last@sub.domain.test", "x@y.zz"]) {
      expect(validateEnquiry(enquiry({ email })).email).toBeUndefined();
    }
  });

  it("requires a message long enough to act on", () => {
    expect(validateEnquiry(enquiry({ message: "" })).message).toBe("Tell us a little about your business");
    expect(validateEnquiry(enquiry({ message: "hi" })).message).toContain("at least");
  });

  it("enforces the same limits the column and the CHECK enforce", () => {
    expect(validateEnquiry(enquiry({ name: "x".repeat(LIMITS.name) })).name).toBeUndefined();
    expect(validateEnquiry(enquiry({ name: "x".repeat(LIMITS.name + 1) })).name).toBeTruthy();
    expect(validateEnquiry(enquiry({ company: "x".repeat(LIMITS.company + 1) })).company).toBeTruthy();
    expect(validateEnquiry(enquiry({ message: "x".repeat(LIMITS.message + 1) })).message).toBeTruthy();
    expect(validateEnquiry(enquiry({ email: `${"x".repeat(250)}@e.test` })).email).toBeTruthy();
  });

  it("validates the TRIMMED value, so whitespace is not a message", () => {
    expect(validateEnquiry(enquiry({ message: "          " })).message).toBeTruthy();
    // ...and trailing space does not push a legal value over the limit.
    expect(validateEnquiry(enquiry({ name: `${"x".repeat(LIMITS.name)}   ` })).name).toBeUndefined();
  });

  it("reports every bad field at once, not one at a time", () => {
    const errors = validateEnquiry({ name: "", email: "nope", company: "", message: "" });
    expect(Object.keys(errors).sort()).toEqual(["email", "message", "name"]);
  });
});

describe("firstEnquiryError", () => {
  it("names the field a reader reaches first", () => {
    expect(firstEnquiryError(validateEnquiry({ name: "", email: "nope", company: "", message: "" })))
      .toBe("Enter your name");
    expect(firstEnquiryError(validateEnquiry(enquiry({ message: "hi" })))).toContain("at least");
  });

  it("is null when there is nothing wrong", () => {
    expect(firstEnquiryError({})).toBeNull();
  });
});
