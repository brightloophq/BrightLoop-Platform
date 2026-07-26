/* =============================================================================
 * Canonical APPLICATION errors (Phase C · Sprint C1).
 *
 * The one error vocabulary the boundary speaks. Every use-case throws one of
 * these; the route handler maps them to HTTP by their `status`. Nothing below
 * this layer's errors — no SQLSTATE, no Postgres message, no stack trace, no
 * `RuntimeErr` detail — ever reaches a response.
 *
 * `code` is a stable machine-readable string for the client; `status` is the
 * HTTP status; `message` is safe, generic prose. Never put an id you have not
 * already authorized the caller to see into a message.
 * ========================================================================== */

export type AppErrorCode =
  | "not_found"
  | "forbidden"
  | "conflict"
  | "validation"
  | "already_running"
  | "already_completed"
  | "cancelled"
  | "retry_unavailable"
  | "runtime_unavailable"
  | "ai_execution_failed";

/** Base class — carries the HTTP status and stable code, nothing sensitive. */
export abstract class ApplicationError extends Error {
  abstract readonly code: AppErrorCode;
  abstract readonly status: number;
  /** Optional field-level detail for validation; never contains DB internals. */
  readonly fields?: Record<string, string>;

  protected constructor(message: string, fields?: Record<string, string>) {
    super(message);
    this.name = new.target.name;
    if (fields !== undefined) this.fields = fields;
  }

  /** The safe wire shape. This is the ONLY thing a response body should carry. */
  toBody(): { error: { code: AppErrorCode; message: string; fields?: Record<string, string> } } {
    return { error: { code: this.code, message: this.message, ...(this.fields ? { fields: this.fields } : {}) } };
  }
}

export class NotFoundError extends ApplicationError {
  readonly code = "not_found" as const;
  readonly status = 404;
  constructor(entity = "resource") {
    super(`${entity} not found`);
  }
}

export class ForbiddenError extends ApplicationError {
  readonly code = "forbidden" as const;
  readonly status = 403;
  constructor(message = "You do not have access to this resource") {
    super(message);
  }
}

export class ConflictError extends ApplicationError {
  readonly code = "conflict" as const;
  readonly status = 409;
  constructor(message = "The request conflicts with the current state") {
    super(message);
  }
}

export class ValidationError extends ApplicationError {
  readonly code = "validation" as const;
  readonly status = 422;
  constructor(message = "The request is invalid", fields?: Record<string, string>) {
    super(message, fields);
  }
}

export class AlreadyRunningError extends ApplicationError {
  readonly code = "already_running" as const;
  readonly status = 409;
  constructor(message = "A scan is already running for this target") {
    super(message);
  }
}

export class AlreadyCompletedError extends ApplicationError {
  readonly code = "already_completed" as const;
  readonly status = 409;
  constructor(message = "This scan has already completed") {
    super(message);
  }
}

export class CancelledError extends ApplicationError {
  readonly code = "cancelled" as const;
  readonly status = 409;
  constructor(message = "This scan has been cancelled") {
    super(message);
  }
}

export class RetryUnavailableError extends ApplicationError {
  readonly code = "retry_unavailable" as const;
  readonly status = 409;
  constructor(message = "There is no failed stage to retry") {
    super(message);
  }
}

/** The runtime denied the operation for a reason not attributable to the caller. */
export class RuntimeUnavailableError extends ApplicationError {
  readonly code = "runtime_unavailable" as const;
  readonly status = 503;
  constructor(message = "The intelligence runtime is temporarily unavailable") {
    super(message);
  }
}

/** An AI provider execution failed after retries + failover (upstream fault). */
export class AiExecutionError extends ApplicationError {
  readonly code = "ai_execution_failed" as const;
  readonly status = 502;
  constructor(message = "The AI provider could not complete the request") {
    super(message);
  }
}

/** Type guard: is this one of our canonical errors (vs. an unexpected throw)? */
export function isApplicationError(value: unknown): value is ApplicationError {
  return value instanceof ApplicationError;
}
