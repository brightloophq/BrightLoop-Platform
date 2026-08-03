/* =============================================================================
 * Google connectors — operation helpers (F4.2). PURE (except output sanitize).
 *
 * Input extraction (validated defensively — the application also validates) and
 * bounded/sanitized output construction. Every operation returns an OperationOutput
 * whose `data` has passed through the framework's `sanitizeConnectorMetadata`, so no
 * secret-looking key ever survives into a result.
 * ========================================================================== */

import { connectorErr, connectorOk, sanitizeConnectorMetadata, type ConnectorResult, type OperationOutput } from "@brightloop/domain";

export type OpInput = Record<string, unknown>;

export function reqStr(input: OpInput, key: string): ConnectorResult<string> {
  const v = input[key];
  if (typeof v !== "string" || v.length === 0) return connectorErr("validation", `'${key}' is required`, "missing_field");
  return connectorOk(v);
}
export function optStr(input: OpInput, key: string, fallback = ""): string {
  const v = input[key];
  return typeof v === "string" && v.length > 0 ? v : fallback;
}
export function optNum(input: OpInput, key: string, fallback: number): number {
  const v = input[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
export function optStrArr(input: OpInput, key: string): string[] {
  const v = input[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
export function obj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
export function arr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(obj) : [];
}

/** Wrap a result object as a bounded, sanitized OperationOutput. */
export function output(data: Record<string, unknown>): ConnectorResult<OperationOutput> {
  return connectorOk({ data: sanitizeConnectorMetadata(data) });
}

/** RFC-822 → base64url, for Gmail send/draft/reply. Node Buffer (data pkg has @types/node). */
export function base64UrlMime(headers: Record<string, string>, body: string): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(headers)) if (v.length > 0) lines.push(`${k}: ${v}`);
  lines.push("Content-Type: text/plain; charset=\"UTF-8\"", "MIME-Version: 1.0", "", body);
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}
