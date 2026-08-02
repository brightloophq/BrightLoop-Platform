/* =============================================================================
 * Integration Platform — read models (F4.1).
 *
 * Marketplace catalogue (from the pure registry), installed connectors, and a
 * connector detail view (installation + recent events, health, audit). Reads are
 * capability-checked; RLS is the final tenant boundary. No secret ever surfaces.
 * ========================================================================== */

import { listConnectors, findConnector } from "@brightloop/domain";
import { authorize, requireIntegration, INTEGRATION_READ_CAP, type AppContext } from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import { loadInstallation } from "./shared.js";
import {
  toConnectorAuditEventDTO, toDescriptorDTO, toConnectorEventDTO, toConnectorHealthDTO, toInstallationDTO,
  type ConnectorAuditEventDTO, type ConnectorDescriptorDTO, type ConnectorEventDTO, type ConnectorHealthDTO, type InstallationDTO,
} from "./dto.js";

/** The marketplace: every connector in the registry (available + examples). */
export function listConnectorCatalogue(ctx: AppContext, category?: string): ConnectorDescriptorDTO[] {
  authorize(ctx.actor, INTEGRATION_READ_CAP, ctx.actor.clientId);
  return listConnectors(category).map(toDescriptorDTO);
}

/** One connector descriptor (marketplace detail), or 404. */
export function getConnectorDescriptor(ctx: AppContext, connectorId: string): ConnectorDescriptorDTO {
  authorize(ctx.actor, INTEGRATION_READ_CAP, ctx.actor.clientId);
  const d = findConnector(connectorId);
  if (d === null) throw new NotFoundError("connector");
  return toDescriptorDTO(d);
}

/** Every connector installed in a workspace. */
export async function listInstallations(ctx: AppContext, rawWorkspaceId: unknown): Promise<InstallationDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  authorize(ctx.actor, INTEGRATION_READ_CAP, ctx.actor.clientId);
  const rows = unwrap(await requireIntegration(ctx).installations.listByWorkspace(workspaceId));
  return rows.map(toInstallationDTO);
}

export interface InstallationDetailDTO {
  installation: InstallationDTO;
  recentEvents: ConnectorEventDTO[];
  recentHealth: ConnectorHealthDTO[];
  recentAudit: ConnectorAuditEventDTO[];
}

/** A connector detail view: the installation plus its recent activity. */
export async function getInstallationDetail(ctx: AppContext, rawId: unknown): Promise<InstallationDetailDTO> {
  const inst = await loadInstallation(ctx, requireId(rawId, "installationId"), INTEGRATION_READ_CAP);
  const repo = requireIntegration(ctx);
  const [events, health, audit] = await Promise.all([
    repo.events.listByInstallation(inst.id, 25),
    repo.health.listByInstallation(inst.id, 10),
    repo.audit.listByInstallation(inst.id, 25),
  ]);
  return {
    installation: toInstallationDTO(inst),
    recentEvents: unwrap(events).map(toConnectorEventDTO),
    recentHealth: unwrap(health).map(toConnectorHealthDTO),
    recentAudit: unwrap(audit).map(toConnectorAuditEventDTO),
  };
}

/** The recent canonical event stream for an installation. */
export async function listInstallationEvents(ctx: AppContext, rawId: unknown, limit = 50): Promise<ConnectorEventDTO[]> {
  const inst = await loadInstallation(ctx, requireId(rawId, "installationId"), INTEGRATION_READ_CAP);
  const rows = unwrap(await requireIntegration(ctx).events.listByInstallation(inst.id, Math.min(Math.max(1, limit), 200)));
  return rows.map(toConnectorEventDTO);
}
