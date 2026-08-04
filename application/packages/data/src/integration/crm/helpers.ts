/* =============================================================================
 * CRM connectors — operation helpers (F4.5). PURE (except output).
 *
 * Defensive input extraction (the application validates too) + bounded/sanitized
 * output construction. Every operation returns an OperationOutput whose `data` has
 * passed through the framework's `sanitizeConnectorMetadata`, so no secret-looking
 * key survives into a result. Shared by all three CRM bindings.
 * ========================================================================== */

import { connectorErr, connectorOk, sanitizeConnectorMetadata, type ConnectorResult, type OperationOutput } from "@brightloop/domain";

export type OpInput = Record<string, unknown>;

export function reqStr(input: OpInput, key: string): ConnectorResult<string> {
  const v = input[key];
  if (typeof v !== "string" || v.length === 0) return connectorErr("validation", `'${key}' is required`, "missing_field");
  return connectorOk(v);
}
/** A typed "required field missing" error assignable to any ConnectorResult<T>. */
export function missing(field: string) {
  return connectorErr("validation", `'${field}' is required`, "missing_field");
}
export function optStr(input: OpInput, key: string, fallback = ""): string {
  const v = input[key];
  return typeof v === "string" && v.length > 0 ? v : fallback;
}
export function optNum(input: OpInput, key: string, fallback: number): number {
  const v = input[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
/** Coerce an id-ish scalar (string|number) to a string; "" for anything else. */
export function scalarStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
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
