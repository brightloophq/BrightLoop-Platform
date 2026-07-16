import "server-only";

import type { AnalyticsEventInput } from "@brightloop/domain";
import { createClient } from "./supabase/server";

/**
 * Server-side analytics emitter.
 *
 * Writes typed events to analytics_events under the caller's session (RLS allows
 * any authenticated insert; internal-only read). Financial/state-changing events
 * are emitted from the server so Admin Analytics is real, not client-inferred
 * (handoff §25).
 *
 * NEVER throws into the caller. Analytics is observability, not correctness — a
 * failed insert must not roll back or block the business action that triggered
 * it. A dropped event is acceptable; a blocked approval is not.
 *
 * Rule: no PII in name or props (handoff §25).
 */
export async function emitEvent(event: AnalyticsEventInput): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("analytics_events").insert({
      name: event.name,
      actor_id: event.actorId ?? null,
      client_id: event.clientId ?? null,
      role: event.role ?? null,
      props: event.props ?? {},
      source: event.source ?? "server",
    });
  } catch {
    // swallowed on purpose — see the note above
  }
}
