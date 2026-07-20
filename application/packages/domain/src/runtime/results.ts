/* =============================================================================
 * Runtime repository RESULTS (Phase B · Sprint 13B §2/§8) — PURE.
 *
 * The repository boundary NEVER throws a raw Supabase/Postgres error. Every
 * operation returns a discriminated `RuntimeResult`, so callers must handle
 * replay, conflict, not-found, lease loss, and terminal state explicitly.
 *
 * `mapDatabaseError` translates Postgres SQLSTATEs into stable domain codes.
 * ========================================================================== */

/** Success outcomes. */
export type RuntimeSuccessCode =
  | "created"    // a new record was written
  | "replayed"   // the same idempotency key + same canonical payload already existed
  | "found"      // a read succeeded
  | "updated"    // an existing record changed
  | "leased"     // a queue job was atomically leased
  | "released";  // a lease was returned

/** Non-success outcomes — expected states, not exceptions. */
export type RuntimeFailureCode =
  | "conflict"           // same idempotency key, DIFFERENT payload — never overwritten
  | "not_found"
  | "no_job_available"   // the queue had no eligible job
  | "lease_lost"         // the caller is not (or is no longer) the lease owner
  | "terminal_state"     // the aggregate cannot leave its terminal status
  | "permission_denied"  // RLS / grant denial
  | "unique_violation"
  | "foreign_key_violation"
  | "check_violation"
  | "serialization_conflict"
  | "database_error";

export type RuntimeResultCode = RuntimeSuccessCode | RuntimeFailureCode;

export type RuntimeOk<T> = { ok: true; code: RuntimeSuccessCode; value: T };
export type RuntimeErr = { ok: false; code: RuntimeFailureCode; message: string; detail: string | null };
export type RuntimeResult<T> = RuntimeOk<T> | RuntimeErr;

export const ok = <T>(code: RuntimeSuccessCode, value: T): RuntimeOk<T> => ({ ok: true, code, value });
export const err = (code: RuntimeFailureCode, message: string, detail: string | null = null): RuntimeErr => ({ ok: false, code, message, detail });

/** Narrowing helper for callers that only care about the happy path. */
export function isOk<T>(result: RuntimeResult<T>): result is RuntimeOk<T> {
  return result.ok;
}

/** Unwrap or throw — for tests and composition roots ONLY, never in domain flow. */
export function expectOk<T>(result: RuntimeResult<T>, context: string): T {
  if (result.ok) return result.value;
  throw new Error(`${context}: ${result.code} — ${result.message}`);
}

/* ---- 8 · database error mapping -------------------------------------------- */
/** Postgres SQLSTATEs the runtime cares about. */
export const SQLSTATE = {
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
  checkViolation: "23514",
  notNullViolation: "23502",
  insufficientPrivilege: "42501",
  serializationFailure: "40001",
  deadlockDetected: "40P01",
  /** PostgREST: no rows returned where exactly one was required. */
  noRows: "PGRST116",
} as const;

/** A minimal shape matching a PostgrestError without importing the SDK type. */
export interface DatabaseErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * Translate a database error into a stable domain code. Unknown SQLSTATEs fall
 * through to `database_error` — never rethrown raw. Pure.
 */
export function mapDatabaseError(error: DatabaseErrorLike | null | undefined, context: string): RuntimeErr {
  const code = error?.code ?? "";
  const message = error?.message ?? "unknown database error";
  const detail = error?.details ?? null;
  const wrap = (c: RuntimeFailureCode) => err(c, `${context}: ${message}`, detail);

  switch (code) {
    case SQLSTATE.uniqueViolation:
      return wrap("unique_violation");
    case SQLSTATE.foreignKeyViolation:
      return wrap("foreign_key_violation");
    case SQLSTATE.checkViolation:
    case SQLSTATE.notNullViolation:
      return wrap("check_violation");
    case SQLSTATE.insufficientPrivilege:
      return wrap("permission_denied");
    case SQLSTATE.serializationFailure:
    case SQLSTATE.deadlockDetected:
      return wrap("serialization_conflict");
    case SQLSTATE.noRows:
      return wrap("not_found");
    default:
      // RLS denial frequently surfaces as a generic message rather than 42501
      if (/row-level security|permission denied/i.test(message)) return wrap("permission_denied");
      return wrap("database_error");
  }
}
