import "server-only";

/**
 * Workspace Copilot — server data access (Phase F · Sprint F2).
 *
 * The ONLY place the Copilot UI reaches data, through the same seam as every other
 * surface: `buildAppContext()` → existing Copilot application read models. No
 * business logic, no queries — RLS scopes everything to the caller's own org
 * (`null` context = unauthenticated). The Copilot consumes application services
 * only; it never touches a repository, provider, or adapter.
 */

import { buildAppContext } from "./runtime-api";
import { resolveWorkspaces, type WorkspaceRef } from "./workspace-data";
import {
  getConversationDetail, listCopilotConversations, suggestActions,
  type ConversationDetailDTO, type CopilotActionDTO, type CopilotConversationDTO,
} from "@brightloop/application";

export interface CopilotBoot {
  workspace: WorkspaceRef | null;
  conversations: CopilotConversationDTO[];
  active: ConversationDetailDTO | null;
  suggestions: CopilotActionDTO[];
}

/** Everything the Copilot console needs on load. `activeId` optionally selects a thread. */
export async function loadCopilotBoot(activeId?: string): Promise<CopilotBoot | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  const workspace = (await resolveWorkspaces())[0] ?? null;
  if (workspace === null) return { workspace: null, conversations: [], active: null, suggestions: [] };

  const conversations = await listCopilotConversations(ctx, workspace.id);
  const selectedId = activeId ?? conversations[0]?.id;
  if (selectedId === undefined) return { workspace, conversations, active: null, suggestions: [] };

  const [active, suggestions] = await Promise.all([
    getConversationDetail(ctx, selectedId).catch(() => null),
    suggestActions(ctx, selectedId).catch(() => [] as CopilotActionDTO[]),
  ]);
  return { workspace, conversations, active, suggestions };
}
