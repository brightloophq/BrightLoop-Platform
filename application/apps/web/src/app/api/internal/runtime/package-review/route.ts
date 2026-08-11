import "server-only";

import { NextResponse } from "next/server";
import { hasCapability, isClientRole } from "@brightloop/schema";
import { decideProspectPackage, isApplicationError, type PackageReviewAction } from "@brightloop/application";
import { getActor } from "@/lib/auth";
import { buildAppContext } from "@/lib/runtime-api";

/**
 * POST /api/internal/runtime/package-review — record a human review decision on a
 * prospect package (approve | request_revision | reject).
 *
 * ██ INTERNAL ONLY ██ — an authenticated internal actor; the DECISION itself is
 * gated in the use-case on the grant-authority capability (`transformation.approve`,
 * owner/admin). Client roles are denied here and by RLS. This records an auditable
 * runtime event; it sends, publishes, or contacts nothing.
 */

const REVIEW_CAPABILITY = "transformation.approve";

interface Body {
  runId: string;
  action: PackageReviewAction;
  note?: string;
}

function parseBody(value: unknown): Body | null {
  if (value === null || typeof value !== "object") return null;
  const b = value as Record<string, unknown>;
  if (typeof b["runId"] !== "string" || b["runId"] === "") return null;
  const action = b["action"];
  if (action !== "approve" && action !== "request_revision" && action !== "reject") return null;
  return { runId: b["runId"], action, ...(typeof b["note"] === "string" ? { note: b["note"] } : {}) };
}

export async function POST(req: Request): Promise<NextResponse> {
  const actor = await getActor();
  if (actor === null) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });
  }
  if (isClientRole(actor.role) || !hasCapability(actor.role, REVIEW_CAPABILITY)) {
    return NextResponse.json({ error: { code: "forbidden", message: "Insufficient capability to review a prospect package" } }, { status: 403 });
  }

  const body = parseBody(await req.json().catch(() => null));
  if (body === null) {
    return NextResponse.json({ error: { code: "validation", message: "runId and a valid action are required" } }, { status: 422 });
  }

  const ctx = await buildAppContext();
  if (ctx === null) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });
  }

  try {
    const review = await decideProspectPackage(ctx, body.runId, { action: body.action, ...(body.note !== undefined ? { note: body.note } : {}) });
    return NextResponse.json(review, { status: 200 });
  } catch (error) {
    if (isApplicationError(error)) return NextResponse.json(error.toBody(), { status: error.status });
    return NextResponse.json({ error: { code: "internal", message: "An unexpected error occurred" } }, { status: 500 });
  }
}
