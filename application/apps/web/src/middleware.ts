import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  surfaceFromHost,
  surfaceFromPath,
  roleFromClaims,
  roleAllowedOn,
  SURFACE_PREFIX,
} from "@/lib/surfaces";

/**
 * Middleware — surface routing + the first authorization check.
 *
 * Routing: subdomains are rewritten to internal path prefixes so one deployable
 * app can serve four surfaces.
 *   brightloop.co/x        → /x            (public route group)
 *   app.brightloop.co/x    → /portal/x     (client portal)
 *   admin.brightloop.co/x  → /admin/x      (admin command center)
 * On localhost there are no subdomains, so /portal and /admin are addressed
 * directly — the same guards apply either way.
 *
 * Authorization: this is check 1 of 3. The protected layouts re-assert the role
 * server-side (check 2), and RLS is the real boundary (check 3). Middleware is
 * the cheap early exit, never the only gate.
 */
export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const hostSurface = surfaceFromHost(request.headers.get("host"));
  const pathSurface = surfaceFromPath(pathname);

  // Host wins when it names a protected surface; otherwise fall back to the path
  // (this is what makes localhost development work without subdomains).
  const surface = hostSurface === "public" ? pathSurface : hostSurface;

  if (surface === "public") {
    return response;
  }

  const role = roleFromClaims(user?.app_metadata);

  if (!user || !role || !roleAllowedOn(surface, role)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", SURFACE_PREFIX[surface]);
    return NextResponse.redirect(loginUrl);
  }

  // Rewrite the subdomain's root-relative path into the surface's route group.
  // If the path already carries the prefix (localhost), leave it alone.
  if (hostSurface !== "public" && pathSurface === "public") {
    const url = request.nextUrl.clone();
    url.pathname = `${SURFACE_PREFIX[hostSurface]}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url, response);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Auth routes are included
     * on purpose so the session cookie is refreshed on them too.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
