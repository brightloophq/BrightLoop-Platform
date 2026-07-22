/* =============================================================================
 * RuntimeResult → application error mapping (Phase C · Sprint C1).
 *
 * The runtime returns a discriminated `RuntimeResult` and never throws a raw DB
 * error. This is the ONE place a runtime FAILURE code becomes an application
 * error. Nothing here inspects `RuntimeErr.detail` (which can carry a DB
 * message) — only the stable `code` is read, so no SQL or internal text can
 * escape through the boundary.
 *
 * Some codes are context-dependent (`terminal_state` means "already completed"
 * for a cancel but "retry unavailable" for a retry), so the caller passes an
 * `on` map to override the defaults per use-case.
 * ========================================================================== */

import type { RuntimeErr, RuntimeFailureCode, RuntimeResult } from "@brightloop/domain";
import type { ApplicationError } from "./errors.js";
import {
  ConflictError,
  NotFoundError,
  RetryUnavailableError,
  RuntimeUnavailableError,
} from "./errors.js";

/** Per-use-case overrides for ambiguous codes. */
export type FailureOverrides = Partial<Record<RuntimeFailureCode, () => ApplicationError>>;

/** Default translation. Infrastructural codes collapse to `runtime_unavailable`. */
function defaultError(err: RuntimeErr): ApplicationError {
  switch (err.code) {
    case "not_found":
      return new NotFoundError();
    case "conflict":
      return new ConflictError();
    case "terminal_state":
      return new ConflictError("The scan is in a terminal state");
    case "no_job_available":
      return new RetryUnavailableError();
    case "permission_denied":
      // The application already authorized the caller; a denial here is RLS
      // refusing an internal-only table — surface as unavailable, not forbidden,
      // to avoid implying the caller could fix it.
      return new RuntimeUnavailableError();
    case "lease_lost":
    case "unique_violation":
    case "foreign_key_violation":
    case "check_violation":
    case "serialization_conflict":
    case "database_error":
      return new RuntimeUnavailableError();
  }
}

/** Map a runtime error to an application error, honoring per-use-case overrides. */
export function toApplicationError(err: RuntimeErr, on: FailureOverrides = {}): ApplicationError {
  const override = on[err.code];
  return override ? override() : defaultError(err);
}

/**
 * Unwrap a `RuntimeResult`, throwing the mapped application error on failure.
 * The one funnel every use-case runs runtime calls through.
 */
export function unwrap<T>(result: RuntimeResult<T>, on: FailureOverrides = {}): T {
  if (result.ok) return result.value;
  throw toApplicationError(result, on);
}
