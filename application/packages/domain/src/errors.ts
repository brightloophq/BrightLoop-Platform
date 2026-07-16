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
