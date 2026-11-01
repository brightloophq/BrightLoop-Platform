/* =============================================================================
 * Portfolio project form — what the server will reject, checked in the browser
 * first so the message can land ON the offending field.
 *
 * The server action stays the authority; this only spares the round trip and,
 * far more importantly, the guessing. The admin form carries `noValidate`, so
 * the browser never enforces `required` either — without this, a missing Client
 * or Year surfaced as a single line at the TOP of a very long form, with no
 * indication of which of two dozen inputs was at fault.
 *
 * Pure, and mirrors `saveProject`'s own checks. Keep the two in step: a rule
 * here that the server does not have is a field the user cannot submit for no
 * reason, and a rule the server has that is missing here is the original defect
 * coming back.
 * ========================================================================== */

/** Field name → the message to show under that field. */
export type ProjectFieldErrors = Record<string, string>;

export const YEAR_MIN = 2000;
export const YEAR_MAX = 2100;

/**
 * What the person typed in Live URL, turned into something storable.
 *
 * `new URL("auxion.xyz")` THROWS — no scheme, so there is nothing to parse.
 * That is how a perfectly ordinary thing to type ("auxion.xyz", "www.acme.com",
 * a pasted address bar that dropped its scheme) came back as "Live URL must be
 * a valid http(s) URL", which reads as a complaint about the domain rather
 * than about the four characters the field wanted in front of it.
 *
 * So a bare host is ASSUMED to be https — the same assumption every browser
 * makes when you type a domain — and only genuinely unusable input is refused.
 * Anything with a scheme keeps it, and a non-web scheme is still rejected:
 * `javascript:` and `data:` must never reach an href on the public site.
 */
export function normaliseLiveUrl(raw: string): { url: string } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { url: "" };

  // A scheme is "word:" at the very start. Without one, assume https rather
  // than failing — but never invent a scheme for something already carrying a
  // rejected one, or "javascript:alert(1)" would become https://javascript...
  //
  // The negative lookahead separates a scheme from a PORT: "." and "-" are legal
  // in a scheme name, so "acme.com:8443" otherwise parses as a scheme called
  // "acme.com" and a perfectly good address is refused. Nothing after a real
  // scheme's colon starts with a digit; a port always does.
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?![0-9])/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { error: `“${trimmed}” is not a web address. Use something like auxion.xyz or https://auxion.xyz.` };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: `Live URL must be a web address (http or https), not “${parsed.protocol}”.` };
  }

  // A URL needs somewhere to go: "https://" alone parses but has no host.
  if (!parsed.hostname || !parsed.hostname.includes(".")) {
    return { error: `“${trimmed}” has no website in it. Use something like auxion.xyz.` };
  }

  return { url: parsed.toString() };
}

export function validateProjectForm(formData: FormData): ProjectFieldErrors {
  const errors: ProjectFieldErrors = {};
  const get = (field: string) => String(formData.get(field) ?? "").trim();

  if (!get("name")) errors.name = "Give the project a name.";
  if (!get("slug")) errors.slug = "A slug is required — it forms the page's URL.";
  if (!get("client")) errors.client = "Name the client this work was for.";

  const rawYear = get("year");
  if (!rawYear) {
    errors.year = "Choose the year the project ran.";
  } else {
    const year = Number(rawYear);
    if (!Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX) {
      errors.year = "That is not a usable year.";
    }
  }

  // The server refuses a bad Live URL too. Without the same rule here it came
  // back as one line at the TOP of a very long form with no field marked —
  // exactly the defect this module exists to prevent.
  if (formData.get("permissionLivePreview") === "on") {
    const raw = get("liveUrl");
    if (!raw) {
      errors.liveUrl = "Add the client's site, or untick the permission above.";
    } else {
      const result = normaliseLiveUrl(raw);
      if ("error" in result) errors.liveUrl = result.error;
    }
  }

  return errors;
}

/** The first field to point the cursor at — insertion order is form order. */
export function firstInvalidField(errors: ProjectFieldErrors): string | undefined {
  return Object.keys(errors)[0];
}

/** One line for the banner; the detail lives on the fields themselves. */
export function summariseErrors(errors: ProjectFieldErrors): string | undefined {
  const count = Object.keys(errors).length;
  if (count === 0) return undefined;
  return count === 1
    ? "One field still needs filling in — it is marked below."
    : `${count} fields still need filling in — they are marked below.`;
}
