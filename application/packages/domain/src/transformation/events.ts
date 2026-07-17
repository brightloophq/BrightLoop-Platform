/* =============================================================================
 * Transformation-cycle event taxonomy. Emitted (as DomainEvents via EventSink)
 * on every material lifecycle change, so audit/analytics reflect real state.
 *
 * Naming: transformation.object.action. No PII in names or props.
 * These are DomainEvent names (free-form by contract); the apps/web analytics
 * emitter can map/persist them without this module depending on Next.
 * ========================================================================== */

import type { DomainEvent, EventSink } from "../events.js";

export const TRANSFORMATION_EVENTS = [
  "transformation.signal.detected",
  "transformation.signal.status_changed",
  "transformation.insight.generated",
  "transformation.insight.status_changed",
  "transformation.recommendation.created",
  "transformation.recommendation.status_changed",
  "transformation.approval.requested",
  "transformation.approval.decided",
  "transformation.move.created",
  "transformation.move.status_changed",
  "transformation.execution.started",
  "transformation.execution.status_changed",
  "transformation.measurement.recorded",
  "transformation.learning.captured",
  "transformation.risk.identified",
  "transformation.risk.status_changed",
  "transformation.knowledge.stored",
  "transformation.knowledge.status_changed",
  "transformation.business_health.recorded",
  "transformation.transformation_index.recorded",
] as const;

export type TransformationEventName = (typeof TRANSFORMATION_EVENTS)[number];

/** Build a server-side DomainEvent with the standard shape. */
export function transformationEvent(
  name: TransformationEventName,
  args: {
    actorId: string | null;
    clientId: string | null;
    at: string;
    props?: Record<string, string | number | boolean | null>;
  },
): DomainEvent {
  return {
    name,
    payload: args.props ?? {},
    actorId: args.actorId,
    clientId: args.clientId,
    at: args.at,
    source: "server",
  };
}

/** Emit a transformation event through the sink (best-effort; never throws into the caller). */
export async function emitTransformation(
  events: EventSink,
  name: TransformationEventName,
  args: { actorId: string | null; clientId: string | null; at: string; props?: Record<string, string | number | boolean | null> },
): Promise<void> {
  await events.emit(transformationEvent(name, args));
}
