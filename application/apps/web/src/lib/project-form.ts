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
