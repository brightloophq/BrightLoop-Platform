/* =============================================================================
 * Contact enquiry — the validation rules, in one place.
 *
 * The same rules have to hold in three places: the form (so a mistake is caught
 * per field before anything is sent), the server action (because a browser is
 * not a trust boundary), and `bl_submit_contact_enquiry` in the database
 * (because the RPC is reachable without either). This module is the first two.
 * The SQL states them again rather than importing them — a constraint that can
 * only be enforced by the code that happens to call it is not a constraint.
 *
 * Pure: no I/O, no clock. The numbers match the column limits and the CHECKs.
 * ========================================================================== */

export interface ContactEnquiryInput {
  name: string;
  email: string;
  company: string;
  message: string;
}

export type ContactField = keyof ContactEnquiryInput;

export type ContactErrors = Partial<Record<ContactField, string>>;

/** Deliberately loose: one @, something either side, a dot in the domain. A
 *  stricter pattern rejects real addresses, and delivery is the real test. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LIMITS = {
  name: 80,
  email: 254,
  company: 120,
  message: 2000,
  messageMin: 10,
} as const;

/** Trimmed values, exactly as they will be stored. */
export function normaliseEnquiry(input: ContactEnquiryInput): ContactEnquiryInput {
  return {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    company: input.company.trim(),
    message: input.message.trim(),
  };
}

/** Per-field errors, empty when the enquiry is submittable. */
export function validateEnquiry(input: ContactEnquiryInput): ContactErrors {
  const { name, email, company, message } = normaliseEnquiry(input);
  const errors: ContactErrors = {};

  if (!name) errors.name = "Enter your name";
  else if (name.length > LIMITS.name) errors.name = `Name must be ${LIMITS.name} characters or fewer`;

  if (!email) errors.email = "Enter a valid email";
  else if (!EMAIL_RE.test(email) || email.length > LIMITS.email) errors.email = "Enter a valid email";

  if (company.length > LIMITS.company) {
    errors.company = `Company must be ${LIMITS.company} characters or fewer`;
  }

  if (!message) errors.message = "Tell us a little about your business";
  else if (message.length < LIMITS.messageMin) {
    errors.message = `Message must be at least ${LIMITS.messageMin} characters`;
  } else if (message.length > LIMITS.message) {
    errors.message = `Message must be ${LIMITS.message.toLocaleString("en-US")} characters or fewer`;
  }

  return errors;
}

/** The first error a reader would see, for a form-level summary. */
export function firstEnquiryError(errors: ContactErrors): string | null {
  const order: ContactField[] = ["name", "email", "company", "message"];
  for (const field of order) {
    const message = errors[field];
    if (message) return message;
  }
  return null;
}
