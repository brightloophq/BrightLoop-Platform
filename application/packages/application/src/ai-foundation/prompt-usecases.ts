/* =============================================================================
 * Prompt lifecycle use-cases (Phase E · Sprint E1).
 *
 * Create prompts, append immutable versions (edits never overwrite history),
 * publish a version (marks the prompt active and points it at that version),
 * deprecate / archive, and roll back to an earlier version. Prompt versions are
 * append-only; `prompt.activeVersion` is the source of truth for which version is
 * live, so publishing/rollback never mutates a version row. Optimistic concurrency
 * on the prompt aggregate.
 * ========================================================================== */

import { buildPrompt, buildVersion, canTransitionPrompt } from "@brightloop/domain";
import type { AiProviderKind, PromptStatus } from "@brightloop/schema";
import { authorize, requireAiFoundation, PROMPT_PUBLISH_CAP, PROMPT_WRITE_CAP, type AppContext } from "../context.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import { toPromptDTO, toPromptVersionDTO, type PromptDTO, type PromptVersionDTO } from "./dto.js";

export interface CreatePromptInput { name: string; description?: string | null; tags?: string[]; ownerUserId?: string; }

export async function createPrompt(ctx: AppContext, rawWorkspaceId: unknown, input: CreatePromptInput): Promise<PromptDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const name = requireString(input.name, "name").trim();
  if (name === "") throw new ValidationError("A prompt name is required");
  const ai = requireAiFoundation(ctx);
  authorize(ctx.actor, PROMPT_WRITE_CAP, ctx.actor.clientId);
  const prompt = buildPrompt({ id: ctx.ids("prompt"), workspaceId, clientId: ctx.actor.clientId, name, description: input.description ?? null, tags: input.tags ?? [], ownerUserId: input.ownerUserId ?? ctx.actor.userId, now: ctx.clock() });
  unwrap(await ai.prompts.create(prompt));
  return toPromptDTO(prompt);
}

export interface AddVersionInput {
  systemPrompt?: string; userTemplate?: string; temperature?: number; maxTokens?: number;
  providerPreference?: AiProviderKind | null; model?: string | null; notes?: string | null;
}

export async function addPromptVersion(ctx: AppContext, rawPromptId: unknown, input: AddVersionInput): Promise<PromptVersionDTO> {
  const promptId = requireId(rawPromptId, "promptId");
  const ai = requireAiFoundation(ctx);
  const prompt = unwrap(await ai.prompts.getById(promptId));
  if (prompt === null) throw new NotFoundError("prompt");
  authorize(ctx.actor, PROMPT_WRITE_CAP, prompt.clientId);
  if (prompt.status === "archived") throw new ConflictError("Cannot add a version to an archived prompt");

  const existing = unwrap(await ai.promptVersions.listByPrompt(promptId));
  const nextVersion = existing.reduce((max, v) => Math.max(max, v.version), 0) + 1;
  const version = buildVersion({ id: ctx.ids("promptver"), promptId, workspaceId: prompt.workspaceId, clientId: prompt.clientId, version: nextVersion, systemPrompt: input.systemPrompt, userTemplate: input.userTemplate, temperature: input.temperature, maxTokens: input.maxTokens, providerPreference: input.providerPreference ?? null, model: input.model ?? null, notes: input.notes ?? null, createdByUserId: ctx.actor.userId, now: ctx.clock() });
  unwrap(await ai.promptVersions.append(version));
  // Touch the prompt (updatedAt) under optimistic concurrency.
  const saved = await ai.prompts.save({ ...prompt, updatedAt: ctx.clock(), version: prompt.version + 1 }, prompt.version);
  if (!saved.ok && (saved.code === "conflict" || saved.code === "serialization_conflict")) throw new ConflictError("The prompt changed concurrently; reload and retry");
  return toPromptVersionDTO(version);
}

/** Point the prompt at `version` and mark it active. */
export async function publishPromptVersion(ctx: AppContext, rawPromptId: unknown, rawVersion: unknown): Promise<PromptDTO> {
  const promptId = requireId(rawPromptId, "promptId");
  const version = Number(rawVersion);
  if (!Number.isInteger(version) || version < 1) throw new ValidationError("A valid version number is required");
  const ai = requireAiFoundation(ctx);
  const prompt = unwrap(await ai.prompts.getById(promptId));
  if (prompt === null) throw new NotFoundError("prompt");
  authorize(ctx.actor, PROMPT_PUBLISH_CAP, prompt.clientId);
  const target = unwrap(await ai.promptVersions.getByPromptAndVersion(promptId, version));
  if (target === null) throw new NotFoundError("prompt version");
  if (prompt.status !== "active" && !canTransitionPrompt(prompt.status, "active")) throw new ConflictError(`Cannot publish a ${prompt.status} prompt`);

  const next = { ...prompt, status: "active" as PromptStatus, activeVersion: version, updatedAt: ctx.clock(), version: prompt.version + 1 };
  const saved = await ai.prompts.save(next, prompt.version);
  if (!saved.ok) {
    if (saved.code === "conflict" || saved.code === "serialization_conflict") throw new ConflictError("The prompt changed concurrently; reload and retry");
    unwrap(saved);
  }
  return toPromptDTO(unwrap(saved));
}

async function transitionPrompt(ctx: AppContext, rawPromptId: unknown, to: "deprecated" | "archived"): Promise<PromptDTO> {
  const promptId = requireId(rawPromptId, "promptId");
  const ai = requireAiFoundation(ctx);
  const prompt = unwrap(await ai.prompts.getById(promptId));
  if (prompt === null) throw new NotFoundError("prompt");
  authorize(ctx.actor, PROMPT_PUBLISH_CAP, prompt.clientId);
  if (prompt.status === to) return toPromptDTO(prompt);
  if (!canTransitionPrompt(prompt.status, to)) throw new ConflictError(`Cannot move a ${prompt.status} prompt to ${to}`);
  const next = { ...prompt, status: to as PromptStatus, updatedAt: ctx.clock(), version: prompt.version + 1 };
  const saved = await ai.prompts.save(next, prompt.version);
  if (!saved.ok) {
    if (saved.code === "conflict" || saved.code === "serialization_conflict") throw new ConflictError("The prompt changed concurrently; reload and retry");
    unwrap(saved);
  }
  return toPromptDTO(unwrap(saved));
}

export const deprecatePrompt = (ctx: AppContext, promptId: unknown): Promise<PromptDTO> => transitionPrompt(ctx, promptId, "deprecated");
export const archivePrompt = (ctx: AppContext, promptId: unknown): Promise<PromptDTO> => transitionPrompt(ctx, promptId, "archived");

/** Roll the active version back to an earlier (existing) version. */
export async function rollbackPrompt(ctx: AppContext, rawPromptId: unknown, rawVersion: unknown): Promise<PromptDTO> {
  const promptId = requireId(rawPromptId, "promptId");
  const version = Number(rawVersion);
  if (!Number.isInteger(version) || version < 1) throw new ValidationError("A valid version number is required");
  const ai = requireAiFoundation(ctx);
  const prompt = unwrap(await ai.prompts.getById(promptId));
  if (prompt === null) throw new NotFoundError("prompt");
  authorize(ctx.actor, PROMPT_PUBLISH_CAP, prompt.clientId);
  if (prompt.status === "archived") throw new ConflictError("Cannot roll back an archived prompt");
  const target = unwrap(await ai.promptVersions.getByPromptAndVersion(promptId, version));
  if (target === null) throw new NotFoundError("prompt version");

  const next = { ...prompt, status: "active" as PromptStatus, activeVersion: version, updatedAt: ctx.clock(), version: prompt.version + 1 };
  const saved = await ai.prompts.save(next, prompt.version);
  if (!saved.ok) {
    if (saved.code === "conflict" || saved.code === "serialization_conflict") throw new ConflictError("The prompt changed concurrently; reload and retry");
    unwrap(saved);
  }
  return toPromptDTO(unwrap(saved));
}
