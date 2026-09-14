import { describe, expect, it } from "vitest";
import {
  firstInvalidField,
  normaliseLiveUrl,
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

describe("normaliseLiveUrl", () => {
  /**
   * The case that prompted this: a bare domain is the most ordinary thing to
   * type, and `new URL()` throws on it — so the form refused the client's own
   * website as "not a valid http(s) URL".
   */
  it("accepts a bare domain and assumes https, as a browser would", () => {
    expect(normaliseLiveUrl("auxion.xyz")).toEqual({ url: "https://auxion.xyz/" });
    expect(normaliseLiveUrl("www.acme.com")).toEqual({ url: "https://www.acme.com/" });
  });

  it("keeps a scheme that is already there, http included", () => {
    expect(normaliseLiveUrl("https://auxion.xyz/work")).toEqual({ url: "https://auxion.xyz/work" });
    expect(normaliseLiveUrl("http://legacy.example.com/")).toEqual({
      url: "http://legacy.example.com/",
    });
  });

  it("keeps a path, query and port intact", () => {
    expect(normaliseLiveUrl("acme.com/work?ref=auxion")).toEqual({
      url: "https://acme.com/work?ref=auxion",
    });
    expect(normaliseLiveUrl("acme.com:8443/x")).toEqual({ url: "https://acme.com:8443/x" });
  });

  it("trims stray whitespace from a paste", () => {
    expect(normaliseLiveUrl("  auxion.xyz  ")).toEqual({ url: "https://auxion.xyz/" });
  });

  it("treats an empty field as empty, not as an error", () => {
    expect(normaliseLiveUrl("")).toEqual({ url: "" });
    expect(normaliseLiveUrl("   ")).toEqual({ url: "" });
  });

  /* ---- what must still be refused ----------------------------------------- */

  it("REFUSES javascript: — it must never reach an href on the public site", () => {
    const result = normaliseLiveUrl("javascript:alert(1)");
    expect(result).toHaveProperty("error");
    // And it must not be "fixed" into https://javascript... by prefixing.
    expect(JSON.stringify(result)).not.toContain("https://javascript");
  });

  it("refuses data: and other non-web schemes", () => {
    expect(normaliseLiveUrl("data:text/html,<script>")).toHaveProperty("error");
    expect(normaliseLiveUrl("ftp://files.example.com")).toHaveProperty("error");
    expect(normaliseLiveUrl("mailto:hi@auxion.xyz")).toHaveProperty("error");
  });

  it("refuses something with no website in it", () => {
    expect(normaliseLiveUrl("just some words")).toHaveProperty("error");
    expect(normaliseLiveUrl("localhost")).toHaveProperty("error");
  });

  it("quotes what the person actually typed, so the message is about their input", () => {
    const result = normaliseLiveUrl("not a url");
    expect("error" in result && result.error).toContain("not a url");
  });
});

describe("validateProjectForm — live URL", () => {
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    fd.set("name", "Project");
    fd.set("slug", "project");
    fd.set("client", "Client");
    fd.set("year", "2025");
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };

  it("ignores the live URL entirely when the permission is off", () => {
    // The server stores "" in that case, so a leftover value must not block a save.
    expect(validateProjectForm(form({ liveUrl: "nonsense" }))).toEqual({});
  });

  it("marks the liveUrl FIELD rather than only the banner", () => {
    const errors = validateProjectForm(
      form({ permissionLivePreview: "on", liveUrl: "javascript:alert(1)" }),
    );
    expect(errors.liveUrl).toBeDefined();
  });

  it("asks for a URL when the permission is on and the field is empty", () => {
    const errors = validateProjectForm(form({ permissionLivePreview: "on", liveUrl: "" }));
    expect(errors.liveUrl).toContain("untick");
  });

  it("passes a bare domain, matching what the server now accepts", () => {
    expect(
      validateProjectForm(form({ permissionLivePreview: "on", liveUrl: "auxion.xyz" })),
    ).toEqual({});
  });
});
