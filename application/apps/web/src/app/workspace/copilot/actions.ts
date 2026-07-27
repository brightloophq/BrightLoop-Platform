"use server";

/* =============================================================================
 * Workspace Copilot server actions (Phase F · Sprint F2) — the ONLY write path.
 *
 * Authenticate → application service → revalidate. React never touches a
 * repository or a runtime service: every turn goes through @brightloop/application
 * so authorization, tenancy, the E7 capability gate, validation and the error
 * taxonomy are exactly those the public API enforces. Only a canonical
 * ApplicationError message ever crosses back — never a stack or SQLSTATE.
 * ========================================================================== */

import { revalidatePath } from "next/cache";
import {
  archiveConversation, createCopilotConversation, executeCopilotAction, generateCopilotResponse,
  isApplicationError, type CopilotResponseDTO,
} from "@brightloop/application";
import { buildAppContext } from "@/lib/runtime-api";
import { resolveWorkspaces } from "@/lib/workspace-data";
import type { CopilotPanel } from "@brightloop/schema";

const COPILOT_PATH = "/workspace/copilot";

export interface CreateResult { ok: boolean; id?: string; error?: string }
export interface ResponseResult { ok: boolean; response?: CopilotResponseDTO; error?: string }
export interface SimpleResult { ok: boolean; error?: string }

function fail(error: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: isApplicationError(error) ? error.message : fallback };
}

/** Start a new conversation in the caller's workspace. */
export async function createConversationAction(panel: CopilotPanel = "workspace", title?: string): Promise<CreateResult> {
  try {
    const ctx = await buildAppContext();
    if (ctx === null) return { ok: false, error: "Your session has expired. Please sign in again." };
    const workspace = (await resolveWorkspaces())[0];
    if (workspace === undefined) return { ok: false, error: "No workspace is available yet." };
    const conv = await createCopilotConversation(ctx, { workspaceId: workspace.id, panel, title });
    revalidatePath(COPILOT_PATH);
    return { ok: true, id: conv.id };
  } catch (err) {
    return fail(err, "The conversation could not be started.");
  }
}

/** Send a user turn and get the cited assistant response. */
export async function sendMessageAction(conversationId: string, text: string): Promise<ResponseResult> {
  try {
    const ctx = await buildAppContext();
    if (ctx === null) return { ok: false, error: "Your session has expired. Please sign in again." };
    const response = await generateCopilotResponse(ctx, conversationId, text);
    revalidatePath(COPILOT_PATH);
    return { ok: true, response };
  } catch (err) {
    return fail(err, "The Copilot could not respond. Please try again.");
  }
}

/** Run a suggested action's capability through the registry gate. */
export async function executeActionAction(conversationId: string, capabilityKey: string): Promise<ResponseResult> {
  try {
    const ctx = await buildAppContext();
    if (ctx === null) return { ok: false, error: "Your session has expired. Please sign in again." };
    const response = await executeCopilotAction(ctx, conversationId, capabilityKey);
    revalidatePath(COPILOT_PATH);
    return { ok: true, response };
  } catch (err) {
    return fail(err, "That action could not be completed.");
  }
}

/** Archive a conversation (session memory is discarded; nothing upstream changes). */
export async function archiveConversationAction(conversationId: string): Promise<SimpleResult> {
  try {
    const ctx = await buildAppContext();
    if (ctx === null) return { ok: false, error: "Your session has expired. Please sign in again." };
    await archiveConversation(ctx, conversationId);
    revalidatePath(COPILOT_PATH);
    return { ok: true };
  } catch (err) {
    return fail(err, "The conversation could not be archived.");
  }
}
