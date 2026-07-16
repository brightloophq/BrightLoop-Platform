import type { ReactNode } from "react";
import { requireSurface } from "@/lib/auth";

/**
 * Client portal layout — server-side surface guard.
 *
 * `requireSurface` re-asserts the role in the Server Component tree. Middleware
 * already checked, but a layout check cannot be bypassed by a client that
 * ignores middleware, and RLS still scopes every row to the caller's org.
 * Three independent checks; this is the second.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  await requireSurface("portal");
  return <>{children}</>;
}
