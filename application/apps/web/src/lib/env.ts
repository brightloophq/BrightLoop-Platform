/**
 * Environment access.
 *
 * ONLY NEXT_PUBLIC_* values may be read here — this module is imported by code
 * that runs in the browser. Server-only secrets (SUPABASE_SECRET_KEY, Stripe
 * secret, n8n secret) must never be referenced from this file.
 *
 * The NEXT_PUBLIC_ prefix is not a convention — it is the bundler's rule for what
 * is allowed into client JavaScript. `SUPABASE_SECRET_KEY` deliberately lacks it,
 * which is what makes it impossible to leak to the client (requirement 7).
 */

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  /**
   * Publishable key (formerly "anon"). Safe to expose: every request it makes
   * runs as `anon`, or as the signed-in user — RLS applies either way.
   */
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  publicHost: process.env.NEXT_PUBLIC_PUBLIC_HOST ?? "brightloop.co",
  portalHost: process.env.NEXT_PUBLIC_PORTAL_HOST ?? "app.brightloop.co",
  adminHost: process.env.NEXT_PUBLIC_ADMIN_HOST ?? "admin.brightloop.co",
} as const;

/**
 * When Supabase is not configured we treat every request as UNAUTHENTICATED —
 * protected surfaces redirect to login. Failing closed is the only acceptable
 * default; never fall back to "allow".
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabasePublishableKey);
}
