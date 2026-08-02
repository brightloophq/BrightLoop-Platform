import "server-only";

/**
 * Integration Platform — server data access (Phase F · Sprint F4.1).
 *
 * The ONLY place the connector UI reaches data, through the same seam as every
 * other surface: `buildAppContext()` → Integration Platform read models. No
 * business logic, no queries — RLS scopes everything to the caller's own org
 * (`null` = unauthenticated). Secrets never appear (the read models are DTO-only).
 */

import { buildAppContext } from "./runtime-api";
import { resolveWorkspaces } from "./workspace-data";
import {
  getConnectorDescriptor, getInstallationDetail, listConnectorCatalogue, listInstallations,
  type ConnectorDescriptorDTO, type InstallationDetailDTO, type InstallationDTO,
} from "@brightloop/application";

async function wid(): Promise<string | null> {
  return (await resolveWorkspaces())[0]?.id ?? null;
}

export interface MarketplaceData { catalogue: ConnectorDescriptorDTO[]; installedConnectorIds: string[] }

/** The connector marketplace + which connectors are already installed here. */
export async function loadMarketplace(): Promise<MarketplaceData | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  const catalogue = listConnectorCatalogue(ctx);
  const workspaceId = await wid();
  const installed = workspaceId === null ? [] : await listInstallations(ctx, workspaceId);
  return { catalogue, installedConnectorIds: installed.map((i) => i.connectorId) };
}

/** One marketplace descriptor (for the connector detail / install page). */
export async function loadConnectorDescriptor(connectorId: string): Promise<ConnectorDescriptorDTO | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  try { return getConnectorDescriptor(ctx, connectorId); } catch { return null; }
}

/** Every connector installed in the workspace. */
export async function loadInstalledConnectors(): Promise<{ installations: InstallationDTO[] } | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  const workspaceId = await wid();
  return { installations: workspaceId === null ? [] : await listInstallations(ctx, workspaceId) };
}

/** A connector installation detail (installation + recent events/health/audit). */
export async function loadInstallationDetail(installationId: string): Promise<InstallationDetailDTO | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  try { return await getInstallationDetail(ctx, installationId); } catch { return null; }
}
