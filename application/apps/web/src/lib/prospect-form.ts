/* =============================================================================
 * Prospect scan form validation (Phase C · Sprint C4) — PURE.
 *
 * Validates the operator's scan request BEFORE it reaches the C1 create-scan
 * use-case. URL safety reuses the Phase-A primitives (`normalizeUrl` +
 * `evaluateSsrf`) rather than re-implementing them, so the form rejects exactly
 * what the crawler would refuse to fetch — the operator learns immediately, not
 * three stages later.
 *
 * Pure and dependency-free so every rule is unit-testable.
 * ========================================================================== */

import { normalizeUrl, evaluateSsrf } from "@brightloop/domain";

export interface ProspectScanInput {
  clientId: string;
  websiteUrl: string;
  businessName: string;
  contactName: string;
  email: string;
  industry: string;
  location: string;
  notes: string;
  maxPages: number;
  reasoningMode: string;
  costAcknowledged: boolean;
  scanAuthorized: boolean;
}

export interface ProspectScanParsed {
  clientId: string;
  /** Canonicalized root URL — what the crawler will actually plan against. */
  rootUrl: string;
  metadata: Record<string, unknown>;
}

export type FieldErrors = Record<string, string>;

export interface ParseResult {
  ok: boolean;
  value?: ProspectScanParsed;
  fieldErrors?: FieldErrors;
}

export const REASONING_MODES = ["standard", "deep"] as const;
export type ReasoningMode = (typeof REASONING_MODES)[number];

export const MAX_PAGES_MIN = 1;
export const MAX_PAGES_MAX = 25;
export const MAX_PAGES_DEFAULT = 8;

const LIMITS = {
  businessName: 160,
  contactName: 120,
  email: 200,
  industry: 120,
  location: 160,
  notes: 2000,
  websiteUrl: 300,
} as const;

/** Anything tag-like is rejected outright — operator notes are plain text. */
const HAS_MARKUP = /[<>]/;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Validate one optional free-text field: length + no markup. */
function checkOptional(errors: FieldErrors, key: keyof typeof LIMITS, value: string): void {
  if (value === "") return;
  if (value.length > LIMITS[key]) errors[key] = `Keep this under ${LIMITS[key]} characters.`;
  else if (HAS_MARKUP.test(value)) errors[key] = "Angle brackets aren't allowed here.";
}

/**
 * Validate + canonicalize a prospect scan request.
 *
 * URL rules (§2): required, http/https only, no embedded credentials, no
 * private/loopback/link-local address. The SSRF verdict is the same one the
 * crawler enforces at fetch time, so the form can never accept a target the
 * runtime would refuse.
 */
export function parseProspectScanForm(form: FormData): ParseResult {
  const errors: FieldErrors = {};

  const clientId = text(form.get("clientId"));
  const websiteUrl = text(form.get("websiteUrl"));
  const businessName = text(form.get("businessName"));
  const contactName = text(form.get("contactName"));
  const email = text(form.get("email"));
  const industry = text(form.get("industry"));
  const location = text(form.get("location"));
  const notes = text(form.get("notes"));
  const reasoningMode = text(form.get("reasoningMode")) || "standard";
  const costAcknowledged = form.get("costAcknowledged") !== null;
  const scanAuthorized = form.get("scanAuthorized") !== null;

  if (clientId === "") errors["clientId"] = "Choose the organization this prospect belongs to.";

  // ---- URL ----
  let rootUrl = "";
  if (websiteUrl === "") {
    errors["websiteUrl"] = "A prospect website URL is required.";
  } else if (websiteUrl.length > LIMITS.websiteUrl) {
    errors["websiteUrl"] = `Keep the URL under ${LIMITS.websiteUrl} characters.`;
  } else {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`;
    const normalized = normalizeUrl(withScheme);
    if (!normalized.valid || normalized.canonicalRoot === null) {
      errors["websiteUrl"] =
        normalized.reason === "unsupported_scheme" ? "Only http:// and https:// URLs can be scanned." : "That doesn't look like a valid website URL.";
    } else {
      // Evaluate the RAW input, not the canonical root: normalization drops
      // userinfo, so checking the canonical form would silently accept
      // `https://user:pass@host`. The raw string still carries host + scheme,
      // so every other SSRF class is caught here too.
      const ssrf = evaluateSsrf(withScheme);
      if (!ssrf.allowed) {
        errors["websiteUrl"] = ssrf.reasons.includes("credentials_in_url")
          ? "Remove the credentials from the URL."
          : "That address is private or local and can't be scanned.";
      } else {
        rootUrl = normalized.canonicalRoot;
      }
    }
  }

  // ---- optional text ----
  checkOptional(errors, "businessName", businessName);
  checkOptional(errors, "contactName", contactName);
  checkOptional(errors, "industry", industry);
  checkOptional(errors, "location", location);
  checkOptional(errors, "notes", notes);
  if (email !== "") {
    if (email.length > LIMITS.email) errors["email"] = `Keep the email under ${LIMITS.email} characters.`;
    else if (!EMAIL.test(email)) errors["email"] = "That doesn't look like a valid email address.";
  }

  // ---- crawl limit ----
  const rawPages = text(form.get("maxPages"));
  const maxPages = rawPages === "" ? MAX_PAGES_DEFAULT : Number(rawPages);
  if (!Number.isInteger(maxPages) || maxPages < MAX_PAGES_MIN || maxPages > MAX_PAGES_MAX) {
    errors["maxPages"] = `Choose between ${MAX_PAGES_MIN} and ${MAX_PAGES_MAX} pages.`;
  }

  // ---- mode + acknowledgements ----
  if (!(REASONING_MODES as readonly string[]).includes(reasoningMode)) {
    errors["reasoningMode"] = "Choose a reasoning mode.";
  }
  if (!costAcknowledged) errors["costAcknowledged"] = "Acknowledge the estimated cost before scanning.";
  if (!scanAuthorized) errors["scanAuthorized"] = "Confirm you're authorized to scan this public website.";

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };

  // Only defined values reach the metadata envelope — no empty-string noise.
  const metadata: Record<string, unknown> = { rootUrl, maxPages, reasoningMode, source: "internal_prospect_scanner" };
  if (businessName !== "") metadata["businessName"] = businessName;
  if (contactName !== "") metadata["contactName"] = contactName;
  if (email !== "") metadata["email"] = email;
  if (industry !== "") metadata["industry"] = industry;
  if (location !== "") metadata["location"] = location;
  if (notes !== "") metadata["notes"] = notes;

  return { ok: true, value: { clientId, rootUrl, metadata } };
}
