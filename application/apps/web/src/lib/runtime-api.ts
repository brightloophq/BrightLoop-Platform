import "server-only";

import { NextResponse } from "next/server";
import { systemClock, type Actor } from "@brightloop/domain";
import { ApplicationError, ForbiddenError, isApplicationError, type AppContext } from "@brightloop/application";
import { getActor } from "./auth";
import { getRuntimeServices, getExecutionRepositories, getCollaborationRepositories, getAiFoundationRepositories, getAiProviderRegistry, getKnowledgeRepositories, getEmbeddingProviderRegistry, getVectorStore, getStrategistRepositories, getProjectManagerRepositories } from "./repositories";

/**
 * The HTTP ↔ application seam for the intelligence runtime.
 *
 * Route handlers stay tiny: resolve the actor, build an `AppContext`, call one
 * use-case, and serialize. All authorization, validation, orchestration and
 * error taxonomy live in `@brightloop/application` — the route knows HTTP, the
 * use-case knows the runtime, and neither knows the other's world.
 */

/** Prefixed-id generator injected into the application layer (mirrors app convention). */
function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build the request-scoped application context, or `null` when unauthenticated.
 *
 * The runtime services carry the caller's RLS-scoped session, so the database is
 * the final tenant boundary even though the application layer authorizes first.
 */
export async function buildAppContext(): Promise<AppContext | null> {
  const actor: Actor | null = await getActor();
  if (actor === null) return null;
  const [services, execution, collaboration, ai, knowledge, vectorStore, strategist, projectManager] = await Promise.all([getRuntimeServices(), getExecutionRepositories(), getCollaborationRepositories(), getAiFoundationRepositories(), getKnowledgeRepositories(), getVectorStore(), getStrategistRepositories(), getProjectManagerRepositories()]);
  return { services, actor, ids: newId, clock: systemClock, execution, collaboration, ai, aiProviders: getAiProviderRegistry(), knowledge, embeddingProviders: getEmbeddingProviderRegistry(), vectorStore, strategist, projectManager };
}

/** JSON body from the request, or `undefined` when the body is absent/unparseable. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

/**
 * Run a use-case and serialize its result, translating every canonical
 * `ApplicationError` to its HTTP status. An unauthenticated caller is 401. An
 * UNEXPECTED throw becomes a generic 500 that leaks nothing — no message, no
 * stack — because only `ApplicationError#toBody` is ever serialized.
 */
export async function handle<T>(
  run: (ctx: AppContext) => Promise<T>,
  init: { status?: number } = {},
): Promise<NextResponse> {
  const ctx = await buildAppContext();
  if (ctx === null) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });
  }
  try {
    const value = await run(ctx);
    return NextResponse.json(value, { status: init.status ?? 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Map any thrown value to a safe HTTP response. */
export function errorResponse(error: unknown): NextResponse {
  if (isApplicationError(error)) {
    return NextResponse.json(error.toBody(), { status: error.status });
  }
  // Never leak an unexpected error's message or stack across the boundary.
  return NextResponse.json({ error: { code: "internal", message: "An unexpected error occurred" } }, { status: 500 });
}

export { ApplicationError, ForbiddenError };
