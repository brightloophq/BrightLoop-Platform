import type { MachineName } from "@brightloop/schema";

/** Thrown when a state change is not listed in the machine's legal transitions. */
export class TransitionError extends Error {
  readonly machine: MachineName;
  readonly from: string;
  readonly to: string;
  /** HTTP status to surface at the API boundary (409 per handoff §03.13). */
  readonly httpStatus = 409;

  constructor(machine: MachineName, from: string, to: string) {
    super(`Illegal transition on '${machine}': '${from}' -> '${to}'`);
    this.name = "TransitionError";
    this.machine = machine;
    this.from = from;
    this.to = to;
  }
}

/** Thrown when the actor's role lacks the required capability. */
export class AuthorizationError extends Error {
  readonly role: string;
  readonly capability: string;
  readonly httpStatus = 403;

  constructor(role: string, capability: string) {
    super(`Role '${role}' lacks capability '${capability}'`);
    this.name = "AuthorizationError";
    this.role = role;
    this.capability = capability;
  }
}

/** Thrown when a referenced entity does not exist. */
export class NotFoundError extends Error {
  readonly entity: string;
  readonly id: string;
  readonly httpStatus = 404;

  constructor(entity: string, id: string) {
    super(`${entity} '${id}' not found`);
    this.name = "NotFoundError";
    this.entity = entity;
    this.id = id;
  }
}

/**
 * Thrown when a Move is asked to execute without a granted human Approval.
 * This is the service-layer half of the human-authority gate (the DB trigger is
 * the other half) — a consequential Move never executes without a real approval.
 */
export class ApprovalRequiredError extends Error {
  readonly moveId: string;
  readonly httpStatus = 409;

  constructor(moveId: string) {
    super(`Move '${moveId}' cannot execute without a granted approval`);
    this.name = "ApprovalRequiredError";
    this.moveId = moveId;
  }
}

/** Thrown when a client-scoped actor targets another client org's record. */
export class ClientScopeError extends Error {
  readonly actorClientId: string | null;
  readonly targetClientId: string;
  readonly httpStatus = 403;

  constructor(actorClientId: string | null, targetClientId: string) {
    super("Cross-client access denied");
    this.name = "ClientScopeError";
    this.actorClientId = actorClientId;
    this.targetClientId = targetClientId;
  }
}
