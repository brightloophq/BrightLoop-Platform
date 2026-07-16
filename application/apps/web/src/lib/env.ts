/**
 * Environment access.
 *
 * Only NEXT_PUBLIC_* values may be read here — this module is imported by code
 * that can run in the browser. Server-only secrets (service role key, Stripe
 * secret, n8n secret) must never be referenced from this file.
 */

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  publicHost: process.env.NEXT_PUBLIC_PUBLIC_HOST ?? "brightloop.co",
  portalHost: process.env.NEXT_PUBLIC_PORTAL_HOST ?? "app.brightloop.co",
  adminHost: process.env.NEXT_PUBLIC_ADMIN_HOST ?? "admin.brightloop.co",
} as const;

/**
 * Sprint 0 has no provisioned Supabase project. When it is not configured we
 * treat every request as UNAUTHENTICATED — protected surfaces redirect to login.
 * Failing closed is the only acceptable default; never fall back to "allow".
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}
