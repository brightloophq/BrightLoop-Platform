import "server-only";

import { MockEmailProvider, type EmailProvider, type SendEmailInput } from "@brightloop/domain";
import { createClient } from "./supabase/server";

/**
 * Transactional email dispatch (handoff §12 · approved Decision G).
 *
 * The PIPELINE is real: event → template selection → consent gate → provider.
 * The PROVIDER is pluggable and, until credentials exist, is the mock.
 *
 * ⚠️ REAL SENDING IS CREDENTIAL-BLOCKED, not built-around.
 *   A live provider (Resend/Postmark) needs an API key we don't have, and it is
 *   also what fixes the 2-emails/hour ceiling on Supabase's built-in dev mailer.
 *   Wiring one is config-only: implement ResendEmailProvider and select it here
 *   when EMAIL_PROVIDER_API_KEY is set. Nothing else changes.
 *
 * CONSENT GATE (handoff §12): "No marketing email without Consent." Transactional
 * mail (magic links, receipts, approval nudges) always sends. Marketing mail
 * checks the recipient's latest granted marketing consent and is DROPPED if it
 * isn't there — the gate is here, not left to the caller to remember.
 */

function selectProvider(): EmailProvider {
  // if (process.env.EMAIL_PROVIDER_API_KEY) return new ResendEmailProvider(...);
  return new MockEmailProvider();
}

export interface DispatchResult {
  sent: boolean;
  reason?: string;
  providerRef?: string;
}

/**
 * Has this user granted marketing consent? Reads the latest marketing Consent
 * record. Absent or revoked → false. Append-only Consent means "latest wins".
 */
async function hasMarketingConsent(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("consents")
    .select("granted")
    .eq("user_id", userId)
    .eq("type", "marketing")
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.granted === true;
}

export async function dispatchEmail(
  input: SendEmailInput & { userId?: string },
): Promise<DispatchResult> {
  // The consent gate — marketing mail requires a granted record.
  if (input.kind === "marketing") {
    if (!input.userId) {
      return { sent: false, reason: "marketing email requires a userId to check consent" };
    }
    const consented = await hasMarketingConsent(input.userId);
    if (!consented) {
      return { sent: false, reason: "no marketing consent on record — not sent" };
    }
  }

  const provider = selectProvider();
  try {
    const result = await provider.send(input);
    return { sent: result.ok, providerRef: result.providerRef };
  } catch (e) {
    // Email is best-effort; never throw into a business action.
    return { sent: false, reason: e instanceof Error ? e.message : "send failed" };
  }
}

/** True when a real provider is configured (drives honest UI copy). */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.EMAIL_PROVIDER_API_KEY);
}
