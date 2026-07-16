/* =============================================================================
 * Domain events — emitted on every legal state transition. Drive notifications,
 * automations (n8n), and analytics. Per handoff §12, anything financial or
 * state-changing is emitted SERVER-SIDE so Admin Analytics reflects real data.
 *
 * Taxonomy: domain.object.action (e.g. "proposal.accept", "payment.succeed").
 * Rule: no PII in event names or props.
 * ========================================================================== */

export interface DomainEvent<P = Record<string, unknown>> {
  /** domain.object.action */
  name: string;
  payload: P;
  actorId: string | null;
  clientId: string | null;
  at: string;
  source: "server" | "client";
}

export interface EventSink {
  emit(event: DomainEvent): Promise<void> | void;
}

/** Collects events in memory — used by tests and as a safe default. */
export class InMemoryEventSink implements EventSink {
  readonly events: DomainEvent[] = [];

  emit(event: DomainEvent): void {
    this.events.push(event);
  }

  clear(): void {
    this.events.length = 0;
  }

  named(name: string): DomainEvent[] {
    return this.events.filter((e) => e.name === name);
  }
}

/** Discards events. Default when no sink is configured, so nothing throws. */
export class NoopEventSink implements EventSink {
  emit(): void {
    /* intentionally empty */
  }
}
