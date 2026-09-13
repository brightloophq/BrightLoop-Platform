import { describe, expect, it } from "vitest";
import {
  firstInvalidField,
  summariseErrors,
  validateProjectForm,
  YEAR_MAX,
  YEAR_MIN,
} from "./project-form";

/** A form with everything the server requires, so each test can remove one thing. */
function validForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    name: "Verdant Fields brand & site",
    slug: "verdant-fields-co",
    client: "Verdant Fields Co.",
    year: "2026",
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

describe("validateProjectForm", () => {
  it("accepts a complete form", () => {
    expect(validateProjectForm(validForm())).toEqual({});
  });

  it("catches the missing client that produced a bare top-of-form error", () => {
    const errors = validateProjectForm(validForm({ client: "" }));
    expect(errors.client).toBeDefined();
    expect(Object.keys(errors)).toEqual(["client"]);
  });

  it("catches the unset Year select, which would have been the very next failure", () => {
    // The select's placeholder option submits "" — Number("") is 0, which the
    // server rejected as "Year must be a valid year" with no field named.
    const errors = validateProjectForm(validForm({ year: "" }));
    expect(errors.year).toContain("Choose the year");
  });

  it("treats whitespace as empty", () => {
    const errors = validateProjectForm(validForm({ client: "   ", name: "  " }));
    expect(errors.client).toBeDefined();
    expect(errors.name).toBeDefined();
  });

  it("reports every missing field at once, not one per submit", () => {
    const fd = new FormData();
    expect(Object.keys(validateProjectForm(fd)).sort()).toEqual(["client", "name", "slug", "year"]);
  });

  it("rejects a year outside the accepted range", () => {
    expect(validateProjectForm(validForm({ year: String(YEAR_MIN - 1) })).year).toBeDefined();
    expect(validateProjectForm(validForm({ year: String(YEAR_MAX + 1) })).year).toBeDefined();
    expect(validateProjectForm(validForm({ year: "not-a-year" })).year).toBeDefined();
    expect(validateProjectForm(validForm({ year: "2026.5" })).year).toBeDefined();
  });

  it("accepts the range boundaries", () => {
    expect(validateProjectForm(validForm({ year: String(YEAR_MIN) })).year).toBeUndefined();
    expect(validateProjectForm(validForm({ year: String(YEAR_MAX) })).year).toBeUndefined();
  });
});

describe("firstInvalidField", () => {
  it("returns the field to focus, in form order", () => {
    const errors = validateProjectForm(new FormData());
    // name is the first control on the form, so it is where the cursor goes.
    expect(firstInvalidField(errors)).toBe("name");
  });

  it("is undefined when nothing is wrong", () => {
    expect(firstInvalidField({})).toBeUndefined();
  });
});

describe("summariseErrors", () => {
  it("says nothing when the form is valid", () => {
    expect(summariseErrors({})).toBeUndefined();
  });

  it("uses the singular for one field", () => {
    expect(summariseErrors({ client: "x" })).toContain("One field");
  });

  it("counts them when there are several", () => {
    expect(summariseErrors({ client: "x", year: "y" })).toContain("2 fields");
  });

  it("always points the reader downwards rather than naming fields twice", () => {
    expect(summariseErrors({ client: "x" })).toContain("marked below");
  });
});
