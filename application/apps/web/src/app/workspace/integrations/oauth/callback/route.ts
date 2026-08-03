/* =============================================================================
 * Connector OAuth callback (Phase F · Sprint F4.2).
 *
 * The provider redirects here with `code` + `state`. We verify the state and
 * exchange the code entirely inside the application use-case (the token bundle
 * goes straight to the ConnectorSecretStore — never to a cookie, query, or log),
 * then redirect back to the connector's detail page. A denied/failed grant lands
 * back on the integrations list with a safe, generic error flag — no provider
 * message, code, or token ever appears in a URL.
 * ========================================================================== */

import { NextResponse } from "next/server";
import { completeConnectorOAuth, isApplicationError } from "@brightloop/application";
import { buildAppContext } from "@/lib/runtime-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  const back = (path: string) => NextResponse.redirect(`${origin}${path}`);

  if (providerError !== null) return back(`/workspace/integrations?connect=denied`);
  if (code === null || state === null) return back(`/workspace/integrations?connect=invalid`);

  const ctx = await buildAppContext();
  if (ctx === null) return back(`/login?next=/workspace/integrations`);

  try {
    const res = await completeConnectorOAuth(ctx, { state, code });
    return back(`/workspace/integrations/${res.installationId}?connect=ok`);
  } catch (err) {
    // Never surface a provider message; a generic flag only.
    void isApplicationError(err);
    return back(`/workspace/integrations?connect=failed`);
  }
}
