/* =============================================================================
 * Salesforce — SAFE allowlisted SOQL construction (F4.5). PURE. SECURITY-CRITICAL.
 *
 * The ONLY place SOQL is ever produced. Raw SOQL is NEVER accepted from a user, the
 * Copilot, or any capability input — the adapter builds every query internally from
 * a small, typed spec whose object + every field are validated against this
 * allowlist. Unknown objects/fields are rejected; string literals are escaped;
 * LIMIT is bounded; identifiers are constrained to `[A-Za-z0-9_]`. This forecloses
 * SOQL injection and arbitrary object traversal by construction.
 * ========================================================================== */

import { connectorErr, connectorOk, type ConnectorResult } from "@brightloop/domain";

/** One queryable object: its API name + the exact fields callers may select/filter. */
interface ObjectSchema { readonly fields: ReadonlySet<string>; readonly defaultFields: readonly string[] }

const S = (fields: string[], defaults: string[]): ObjectSchema => ({ fields: new Set(fields), defaultFields: defaults });

/** The complete allowlist. No object or field outside this map is ever reachable. */
export const SALESFORCE_SCHEMA: Readonly<Record<string, ObjectSchema>> = {
  Contact: S(["Id", "FirstName", "LastName", "Name", "Email", "Phone", "AccountId", "OwnerId", "CreatedDate", "LastModifiedDate"], ["Id", "FirstName", "LastName", "Email", "Phone", "AccountId", "OwnerId", "LastModifiedDate"]),
  Account: S(["Id", "Name", "Website", "Industry", "OwnerId", "CreatedDate", "LastModifiedDate"], ["Id", "Name", "Website", "Industry", "OwnerId", "LastModifiedDate"]),
  Lead: S(["Id", "FirstName", "LastName", "Name", "Email", "Company", "Status", "OwnerId", "CreatedDate", "LastModifiedDate"], ["Id", "FirstName", "LastName", "Email", "Company", "Status", "OwnerId"]),
  Opportunity: S(["Id", "Name", "Amount", "StageName", "CloseDate", "AccountId", "OwnerId", "IsClosed", "IsWon", "CreatedDate", "LastModifiedDate"], ["Id", "Name", "Amount", "StageName", "CloseDate", "AccountId", "OwnerId", "IsClosed", "IsWon", "LastModifiedDate"]),
  User: S(["Id", "Name", "Email", "IsActive"], ["Id", "Name", "Email", "IsActive"]),
  Task: S(["Id", "Subject", "Status", "ActivityDate", "OwnerId", "WhatId", "WhoId", "CreatedDate"], ["Id", "Subject", "Status", "ActivityDate", "OwnerId", "CreatedDate"]),
  OpportunityStage: S(["Id", "MasterLabel", "IsClosed", "IsWon", "SortOrder", "DefaultProbability"], ["Id", "MasterLabel", "IsClosed", "IsWon", "SortOrder", "DefaultProbability"]),
  Organization: S(["Id", "Name"], ["Id", "Name"]),
};

const MAX_LIMIT = 200;
const IDENT = /^[A-Za-z0-9_]+$/;

export interface SoqlSpec {
  object: string;
  /** Subset of the object's allowlisted fields; defaults to `defaultFields`. */
  fields?: readonly string[];
  /** Equality filters — each field allowlisted, each value escaped. */
  whereEquals?: Record<string, string | number | boolean>;
  /** A free-text term matched (LIKE %term%) across the given allowlisted fields. */
  whereLike?: { fields: readonly string[]; term: string };
  orderBy?: string;
  orderDir?: "ASC" | "DESC";
  limit?: number;
}

/**
 * Escape a SOQL string literal: drop ASCII control chars (code point < 32 or 127),
 * then escape backslash + single-quote per SOQL literal rules. Implemented as a
 * code-point loop (no regex) so no control byte can appear in this source file.
 */
export function escapeSoqlLiteral(value: string): string {
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

function isAllowed(schema: ObjectSchema, field: string): boolean {
  return IDENT.test(field) && schema.fields.has(field);
}

/**
 * Build a SOQL query from a validated spec, or reject with a normalized failure.
 * Every object + field is checked against the allowlist; string literals are escaped;
 * LIMIT is clamped to [1, 200]. There is no code path that emits caller-supplied SOQL.
 */
export function buildSoql(spec: SoqlSpec): ConnectorResult<string> {
  const schema = SALESFORCE_SCHEMA[spec.object];
  if (schema === undefined || !IDENT.test(spec.object)) return connectorErr("validation", `object ${spec.object} is not queryable`, "object_not_allowed");

  const fields = (spec.fields && spec.fields.length > 0 ? spec.fields : schema.defaultFields);
  for (const f of fields) if (!isAllowed(schema, f)) return connectorErr("validation", `field ${f} is not selectable on ${spec.object}`, "field_not_allowed");

  const clauses: string[] = [];
  for (const [field, value] of Object.entries(spec.whereEquals ?? {})) {
    if (!isAllowed(schema, field)) return connectorErr("validation", `field ${field} is not filterable on ${spec.object}`, "field_not_allowed");
    if (typeof value === "boolean" || typeof value === "number") clauses.push(`${field} = ${value}`);
    else clauses.push(`${field} = '${escapeSoqlLiteral(value)}'`);
  }
  if (spec.whereLike && spec.whereLike.term.length > 0) {
    const term = escapeSoqlLiteral(spec.whereLike.term);
    const ors: string[] = [];
    for (const field of spec.whereLike.fields) {
      if (!isAllowed(schema, field)) return connectorErr("validation", `field ${field} is not filterable on ${spec.object}`, "field_not_allowed");
      ors.push(`${field} LIKE '%${term}%'`);
    }
    if (ors.length > 0) clauses.push(`(${ors.join(" OR ")})`);
  }

  let soql = `SELECT ${fields.join(", ")} FROM ${spec.object}`;
  if (clauses.length > 0) soql += ` WHERE ${clauses.join(" AND ")}`;
  if (spec.orderBy) {
    if (!isAllowed(schema, spec.orderBy)) return connectorErr("validation", `field ${spec.orderBy} is not orderable on ${spec.object}`, "field_not_allowed");
    soql += ` ORDER BY ${spec.orderBy} ${spec.orderDir === "DESC" ? "DESC" : "ASC"}`;
  }
  const limit = Math.min(Math.max(1, Math.trunc(spec.limit ?? 50)), MAX_LIMIT);
  soql += ` LIMIT ${limit}`;
  return connectorOk(soql);
}
