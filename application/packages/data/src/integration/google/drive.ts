/* =============================================================================
 * Google Drive operations (F4.2). Provider-neutral in/out.
 *
 * Binary content (download bytes / raw upload payloads) is NOT surfaced in a JSON
 * OperationOutput — operations return file metadata + intent. Streaming binary is a
 * separate concern (documented limitation).
 * ========================================================================== */

import type { CanonicalConnectorEvent, ConnectorResult, OperationOutput, PollResult } from "@brightloop/domain";
import { callGoogle, type GoogleAdapterConfig } from "./client.js";
import { arr, optNum, optStr, output, reqStr, type OpInput } from "./helpers.js";

const BASE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FILE_FIELDS = "id,name,mimeType,size,modifiedTime,parents";
const normFile = (f: Record<string, unknown>) => ({ id: optStr(f, "id"), name: optStr(f, "name"), mimeType: optStr(f, "mimeType"), size: optStr(f, "size"), modifiedTime: optStr(f, "modifiedTime") });

export type DriveHandler = (cfg: GoogleAdapterConfig, token: string | null, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>;

async function listFiles(cfg: GoogleAdapterConfig, token: string | null, q: string | undefined, pageSize: number): Promise<ConnectorResult<OperationOutput>> {
  const res = await callGoogle(cfg, token, { method: "GET", url: `${BASE}/files`, query: { q, pageSize, fields: `files(${FILE_FIELDS}),nextPageToken` } });
  if (!res.ok) return res;
  return output({ files: arr(res.value["files"]).map(normFile), nextPageToken: optStr(res.value, "nextPageToken") });
}

export const DRIVE_OPS: Record<string, DriveHandler> = {
  "drive.files.list": (cfg, t, input) => listFiles(cfg, t, undefined, optNum(input, "pageSize", 25)),
  "drive.files.search": async (cfg, t, input) => {
    const q = reqStr(input, "query"); if (!q.ok) return q;
    return listFiles(cfg, t, q.value, optNum(input, "pageSize", 25));
  },
  "drive.folders.list": (cfg, t, input) => listFiles(cfg, t, `mimeType='application/vnd.google-apps.folder'${optStr(input, "parentId") ? ` and '${optStr(input, "parentId")}' in parents` : ""}`, optNum(input, "pageSize", 25)),
  "drive.files.get": async (cfg, t, input) => {
    const id = reqStr(input, "fileId"); if (!id.ok) return id;
    const res = await callGoogle(cfg, t, { method: "GET", url: `${BASE}/files/${encodeURIComponent(id.value)}`, query: { fields: FILE_FIELDS } });
    if (!res.ok) return res;
    return output(normFile(res.value));
  },
  "drive.files.download": async (cfg, t, input) => {
    const id = reqStr(input, "fileId"); if (!id.ok) return id;
    // Fetch metadata only; bytes are streamed out-of-band, never in a JSON result.
    const res = await callGoogle(cfg, t, { method: "GET", url: `${BASE}/files/${encodeURIComponent(id.value)}`, query: { fields: FILE_FIELDS } });
    if (!res.ok) return res;
    return output({ ...normFile(res.value), downloadPrepared: true });
  },
  "drive.files.upload": async (cfg, t, input) => {
    const name = reqStr(input, "name"); if (!name.ok) return name;
    const metadata: Record<string, unknown> = { name: name.value };
    const parentId = optStr(input, "parentId");
    if (parentId.length > 0) metadata["parents"] = [parentId];
    // Metadata-only create (empty file); binary body upload is out of scope here.
    const res = await callGoogle(cfg, t, { method: "POST", url: `${BASE}/files`, query: { fields: FILE_FIELDS }, jsonBody: metadata });
    if (!res.ok) return res;
    return output({ ...normFile(res.value), uploadEndpoint: UPLOAD });
  },
  "drive.permissions.list": async (cfg, t, input) => {
    const id = reqStr(input, "fileId"); if (!id.ok) return id;
    const res = await callGoogle(cfg, t, { method: "GET", url: `${BASE}/files/${encodeURIComponent(id.value)}/permissions`, query: { fields: "permissions(id,role,type,emailAddress)" } });
    if (!res.ok) return res;
    return output({ permissions: arr(res.value["permissions"]).map((p) => ({ id: optStr(p, "id"), role: optStr(p, "role"), type: optStr(p, "type") })) });
  },
};

/** Poll the change feed → canonical `drive.file.changed`. Cursor = newest modifiedTime+id. */
export async function drivePoll(cfg: GoogleAdapterConfig, token: string | null, _conn: OpInput, cursor: string | null, limit: number): Promise<ConnectorResult<PollResult>> {
  const res = await callGoogle(cfg, token, { method: "GET", url: `${BASE}/files`, query: { pageSize: limit, orderBy: "modifiedTime desc", fields: `files(${FILE_FIELDS})` } });
  if (!res.ok) return res;
  const events: CanonicalConnectorEvent[] = arr(res.value["files"]).map((f) => ({
    type: "drive.file.changed", externalId: optStr(f, "id"), occurredAt: optStr(f, "modifiedTime") || cfg.now(),
    payload: { name: optStr(f, "name"), mimeType: optStr(f, "mimeType") }, provenance: "google-drive:poll",
  })).filter((e) => e.externalId.length > 0);
  const nextCursor = events[0]?.externalId ?? cursor;
  return { ok: true, value: { events, nextCursor } };
}
