"use server";

/* =============================================================================
 * Contact enquiry intake.
 *
 * WHAT THIS IS NOT: it does not send email. The transactional provider is still
 * unconfigured, and a form whose only record of an enquiry is an email is one
 * mail failure away from losing it silently. The enquiry is written to the
 * leads pipeline first — durable, visible in the admin, and readable back.
 * Notification can be layered on top later without risking the record.
 *
 * WHY THE ANON CLIENT, NOT SERVICE ROLE
 *   `createProspectAccount` uses the service-role key because it provisions an
 *   auth user and a tenant org, which nothing else can do. Filing an enquiry
 *   needs none of that reach. `bl_submit_contact_enquiry` is a security-definer
 *   RPC granted to `anon`: it writes one row with the stage, source, value and
 *   owner fixed by the function, and returns only the new id. So this path runs
 *   with the ordinary anon key and cannot be made to do anything else, even if
 *   this file were wrong.
 *
 * Turnstile gates it (fails CLOSED in production, see lib/turnstile.ts).
 * ========================================================================== */

import { createClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";
import {
  firstEnquiryError,
  normaliseEnquiry,
  validateEnquiry,
  type ContactErrors,
} from "@/lib/contact-enquiry";

export interface EnquiryState {
  ok?: boolean;
  error?: string;
  fieldErrors?: ContactErrors;
  /** The recorded lead id. Present on success; shown to nobody, useful in logs. */
  leadId?: string;
}

/** The generic failure. Specific reasons are returned above it where we have one. */
const GENERIC = "Your enquiry couldn't be sent. Please try again, or email us directly.";

export async function submitContactEnquiry(formData: FormData): Promise<EnquiryState> {
  const input = normaliseEnquiry({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    company: String(formData.get("company") ?? ""),
    message: String(formData.get("message") ?? ""),
  });

  // Re-run the form's own rules server-side: the browser is not a trust boundary.
  const fieldErrors = validateEnquiry(input);
  if (Object.keys(fieldErrors).length > 0) {
    return { error: firstEnquiryError(fieldErrors) ?? GENERIC, fieldErrors };
  }

  const turnstile = await verifyTurnstile(String(formData.get("turnstileToken") ?? "") || null);
  if (!turnstile.ok) return { error: turnstile.reason ?? "Anti-bot check failed." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bl_submit_contact_enquiry", {
    p_name: input.name,
    p_email: input.email,
    p_company: input.company,
    p_message: input.message,
  });

  if (error) {
    // 53400 is the function's own rate limit — the one refusal a visitor can act
    // on, so it is the one we pass through. Everything else stays generic: a
    // database message is not something to show a stranger.
    if (error.code === "53400") {
      return {
        error: "We've already had several enquiries from this address in the last hour. Email us directly and we'll pick it up.",
      };
    }
    return { error: GENERIC };
  }

  // The `contact.enquiry` analytics event is written by the RPC, in the same
  // transaction as the lead. It cannot be written from here: emitEvent() writes
  // as the caller, and analytics_events admits inserts only from an
  // authenticated role — every call from an anonymous visitor would have been
  // silently swallowed.
  return { ok: true, leadId: typeof data === "string" ? data : undefined };
}
