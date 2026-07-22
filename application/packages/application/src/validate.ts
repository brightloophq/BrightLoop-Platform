/* =============================================================================
 * Input validation (Phase C · Sprint C1).
 *
 * Every endpoint validates its input HERE, before entering the runtime — id
 * format, required fields, shape. Never rely on a downstream layer to reject a
 * malformed request; by the time the runtime sees an id it is already known
 * well-formed. All failures throw `ValidationError` (422) with field detail.
 * ========================================================================== */

import { ValidationError } from "./errors.js";

/** Runtime ids we mint: a short prefix, an underscore, then url-safe id chars. */
const ID_RE = /^[a-z][a-z0-9]{0,15}_[A-Za-z0-9-]{1,64}$/;
/** External keys (e.g. `clients.id`): url-safe, no format we own. */
const ID_LIKE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
/** ISO-8601 instant, as produced by `Date#toISOString`. */
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Assert a value is a non-empty, well-formed prefixed runtime id (e.g. `run_…`). */
export function requireId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError(`'${field}' is required`, { [field]: "required" });
  }
  if (!ID_RE.test(value)) {
    throw new ValidationError(`'${field}' is not a valid id`, { [field]: "invalid_format" });
  }
  return value;
}

/** Assert a value is a non-empty, url-safe external id (e.g. a client id). */
export function requireIdLike(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError(`'${field}' is required`, { [field]: "required" });
  }
  if (!ID_LIKE_RE.test(value)) {
    throw new ValidationError(`'${field}' is not a valid id`, { [field]: "invalid_format" });
  }
  return value;
}

/** Assert a required non-empty string (no format constraint). */
export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`'${field}' is required`, { [field]: "required" });
  }
  return value;
}

/** Optional ISO-8601 instant; returns null when absent, throws when malformed. */
export function optionalIso(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !ISO_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`'${field}' must be an ISO-8601 timestamp`, { [field]: "invalid_format" });
  }
  return value;
}

/** Optional plain object (the metadata envelope); rejects arrays and scalars. */
export function optionalRecord(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`'${field}' must be an object`, { [field]: "invalid_type" });
  }
  return value as Record<string, unknown>;
}

/** Parse an unknown request body into a plain object, or throw 422. */
export function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export { ID_RE, ID_LIKE_RE };
