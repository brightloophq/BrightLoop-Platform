import "server-only";

import {
  getTransformationWorkspace,
  getWorkspaceExecution,
  getWorkspacePerformance,
  listFeed,
  listInbox,
  listSubscriptions,
  listTransformationWorkspaces,
  isApplicationError,
  type FeedPageDTO,
  type InboxSummaryDTO,
  type SubscriptionSummaryDTO,
  type WorkspaceDetailDTO,
  type WorkspaceExecutionDTO,
  type WorkspacePerformanceDTO,
  type WorkspaceSummaryDTO,
} from "@brightloop/application";
import { buildAppContext } from "./runtime-api";

/** A workspace detail + its execution rollup (reviews / tasks / dependencies). */
export interface WorkspaceExecutionView {
  detail: WorkspaceDetailDTO;
  execution: WorkspaceExecutionDTO;
  performance: WorkspacePerformanceDTO;
  /** D7 collaboration: the activity feed, the caller's inbox, and subscriptions. */
  feed: FeedPageDTO;
  inbox: InboxSummaryDTO;
  subscriptions: SubscriptionSummaryDTO;
}

/**
 * Transformation Execution read models (Phase D · Sprint D1).
 *
 * Server-only. Every read goes through a Phase D application use-case, so the page
 * inherits the same authorization, tenancy and DTO boundary as the API — it never
 * touches a repository or a runtime service. Missing data resolves to `null`, an
 * explicit "not produced yet" state, never an error page.
 */

/** The operator's seeded transformation workspaces (read-only). */
export async function loadTransformationWorkspaceList(): Promise<WorkspaceSummaryDTO[] | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  return listTransformationWorkspaces(ctx);
}

/** One workspace's full read model, or `null` when it does not exist / not visible. */
export async function loadTransformationWorkspace(id: string): Promise<WorkspaceDetailDTO | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  try {
    return await getTransformationWorkspace(ctx, id);
  } catch (error) {
    if (isApplicationError(error) && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
}

/** A workspace detail + execution rollup (D3/D4), or `null` when not visible. */
export async function loadTransformationWorkspaceExecution(id: string): Promise<WorkspaceExecutionView | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  try {
    const [detail, execution, performance, feed, inbox, subscriptions] = await Promise.all([
      getTransformationWorkspace(ctx, id),
      getWorkspaceExecution(ctx, id),
      getWorkspacePerformance(ctx, id),
      listFeed(ctx, id, { limit: 30 }),
      listInbox(ctx),
      listSubscriptions(ctx),
    ]);
    return { detail, execution, performance, feed, inbox, subscriptions };
  } catch (error) {
    if (isApplicationError(error) && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
}
