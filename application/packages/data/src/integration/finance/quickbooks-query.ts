/* =============================================================================
 * QuickBooks — SAFE allowlisted query construction (F4.6). PURE. SECURITY-CRITICAL.
 *
 * The ONLY place a QuickBooks query string is ever produced. Raw QBO query text is
 * NEVER accepted from a user, the Copilot, or any capability input — the adapter builds
 * every query internally from a small, typed spec whose entity is validated against
 * this allowlist. Unknown entities are rejected; string literals are escaped; equality
 * filter fields are constrained to `[A-Za-z0-9_.]`; MAXRESULTS + STARTPOSITION are
 * bounded. This forecloses query injection and arbitrary entity traversal by
 * construction. QuickBooks has no first-class REST list endpoint — every list/read goes
 * through the query endpoint — so this builder is the single safe gateway.
 * ========================================================================== */

import { connectorErr, connectorOk, type ConnectorResult } from "@brightloop/domain";

/** The complete allowlist. No entity outside this set is ever queryable. */
export const QUICKBOOKS_ENTITIES: ReadonlySet<string> = new Set([
  "CompanyInfo", "Account", "Customer", "Invoice", "Payment", "Purchase", "Item", "TaxCode", "TaxRate",
]);

const MAX_RESULTS = 1000;
const IDENT = /^[A-Za-z0-9_.]+$/;

export interface QboQuerySpec {
  entity: string;
  /** Equality filters — each field constrained to a safe identifier, each value escaped. */
  whereEquals?: Record<string, string | number | boolean>;
  /** A field to order by (constrained to a safe identifier). */
  orderBy?: string;
  orderDir?: "ASC" | "DESC";
  /** 1-based start position for pagination. */
  startPosition?: number;
  maxResults?: number;
}

/**
 * Escape a QBO string literal: drop ASCII control chars (code point < 32 or 127), then
 * escape backslash + single-quote per QBO literal rules. Implemented as a code-point
 * loop (no regex) so no control byte can appear in this source file.
 */
export function escapeQboLiteral(value: string): string {
  let out = "";
  for (const ch of value) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 32 || c === 127) continue;
    if (ch === "\\") { out += "\\\\"; continue; }
    if (ch === "'") { out += "\\'"; continue; }
    out += ch;
  }
  return out;
}

/**
 * Build a QuickBooks query from a validated spec, or reject with a normalized failure.
 * The entity is checked against the allowlist; filter fields are identifier-constrained;
 * string literals are escaped; MAXRESULTS is clamped to [1, 1000]. There is no code path
 * that emits caller-supplied query text.
 */
export function buildQboQuery(spec: QboQuerySpec): ConnectorResult<string> {
  if (!QUICKBOOKS_ENTITIES.has(spec.entity) || !IDENT.test(spec.entity)) {
    return connectorErr("validation", `entity ${spec.entity} is not queryable`, "entity_not_allowed");
  }

  const clauses: string[] = [];
  for (const [field, value] of Object.entries(spec.whereEquals ?? {})) {
    if (!IDENT.test(field)) return connectorErr("validation", `field ${field} is not filterable`, "field_not_allowed");
    if (typeof value === "boolean" || typeof value === "number") clauses.push(`${field} = ${value}`);
    else clauses.push(`${field} = '${escapeQboLiteral(value)}'`);
  }

  let query = `SELECT * FROM ${spec.entity}`;
  if (clauses.length > 0) query += ` WHERE ${clauses.join(" AND ")}`;
  if (spec.orderBy !== undefined) {
    if (!IDENT.test(spec.orderBy)) return connectorErr("validation", `field ${spec.orderBy} is not orderable`, "field_not_allowed");
    query += ` ORDERBY ${spec.orderBy} ${spec.orderDir === "DESC" ? "DESC" : "ASC"}`;
  }
  const start = Math.max(1, Math.trunc(spec.startPosition ?? 1));
  const max = Math.min(Math.max(1, Math.trunc(spec.maxResults ?? 50)), MAX_RESULTS);
  query += ` STARTPOSITION ${start} MAXRESULTS ${max}`;
  return connectorOk(query);
}
