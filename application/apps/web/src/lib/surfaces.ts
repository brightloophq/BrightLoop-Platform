import { isRole, type Role } from "@brightloop/schema";
import { env } from "./env";

/**
 * The four surfaces of the single deployable app. The boundary that matters is
 * auth + role, not the host (handoff §01.1) — hosts are just how we route to
 * the right route group.
 */
export type Surface = "public" | "portal" | "admin";

/** Internal path prefix each surface's routes live under. */
export const SURFACE_PREFIX: Record<Exclude<Surface, "public">, string> = {
  portal: "/portal",
  admin: "/admin",
};

/** Roles permitted on each protected surface. */
export const SURFACE_ROLES: Record<Exclude<Surface, "public">, readonly Role[]> = {
  portal: ["client_admin", "client_member"],
  admin: ["owner", "admin", "team_member"],
};

/** Resolve a surface from the request host. Unknown hosts (incl. localhost) are public. */
export function surfaceFromHost(host: string | null): Surface {
  if (!host) return "public";
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  if (hostname === env.portalHost.toLowerCase()) return "portal";
  if (hostname === env.adminHost.toLowerCase()) return "admin";
  return "public";
}

/** Resolve a surface from an internal pathname (how dev/localhost addresses them). */
export function surfaceFromPath(pathname: string): Surface {
  if (pathname === "/portal" || pathname.startsWith("/portal/")) return "portal";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  return "public";
}

/** Read the role claim stamped by the DB auth hook. Returns null if absent/invalid. */
export function roleFromClaims(appMetadata: unknown): Role | null {
  if (typeof appMetadata !== "object" || appMetadata === null) return null;
  const role = (appMetadata as Record<string, unknown>)["role"];
  if (typeof role !== "string" || !isRole(role)) return null;
  return role;
}

/** Read the client_id claim. Null for internal roles (and when absent). */
export function clientIdFromClaims(appMetadata: unknown): string | null {
  if (typeof appMetadata !== "object" || appMetadata === null) return null;
  const clientId = (appMetadata as Record<string, unknown>)["client_id"];
  return typeof clientId === "string" && clientId.length > 0 ? clientId : null;
}

/** Is this role allowed on this protected surface? */
export function roleAllowedOn(surface: Exclude<Surface, "public">, role: Role): boolean {
  return SURFACE_ROLES[surface].includes(role);
}
