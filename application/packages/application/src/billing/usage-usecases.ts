/* =============================================================================
 * Billing — usage metering use-cases (F5).
 *
 * recordUsage appends an idempotent raw usage event. High-volume + replay-safe:
 * the same natural-identity key contributes exactly once. System writes need
 * billing.usage.write. Aggregation is a pure domain fold (see billing-read).
 * ========================================================================== */

import { billingUsageEventSchema, type UsageMeter } from "@brightloop/schema";
import { usageKey } from "@brightloop/domain";

import { BILLING_USAGE_CAP, requireBilling, type AppContext } from "../context.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import { loadSubscription } from "./shared.js";

export interface RecordUsageInput {
  subscriptionId: string;
  meter: UsageMeter;
  quantity: number;
  occurredAt?: string;
  source?: string;
  /** Disambiguates multiple events at the same instant; defaults to 0. */
  ordinal?: string | number;
  /** Explicit idempotency key overrides the derived one. */
  idempotencyKey?: string;
}

export interface UsageRecordResult {
  recorded: boolean;
  replayed: boolean;
  meter: string;
  quantity: number;
  occurredAt: string;
}

/** Append a metered usage event (idempotent). Replay returns `replayed:true`. */
export async function recordUsage(ctx: AppContext, input: RecordUsageInput): Promise<UsageRecordResult> {
  const sub = await loadSubscription(ctx, requireId(input.subscriptionId, "subscriptionId"), BILLING_USAGE_CAP);
  const meter = requireString(input.meter, "meter") as UsageMeter;
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) {
    // Invalid usage is dropped defensively rather than corrupting the ledger.
    return { recorded: false, replayed: false, meter, quantity: 0, occurredAt: ctx.clock() };
  }
  const occurredAt = input.occurredAt ?? ctx.clock();
  const source = input.source ?? "system";
  const key = input.idempotencyKey ?? usageKey(sub.id, meter, occurredAt, source, input.ordinal ?? 0);

  const repo = requireBilling(ctx);
  const existing = unwrap(await repo.usage.findByIdempotencyKey(key));
  if (existing !== null) {
    return { recorded: false, replayed: true, meter, quantity: existing.quantity, occurredAt: existing.occurredAt };
  }

  const event = billingUsageEventSchema.parse({
    id: ctx.ids("buse"),
    workspaceId: sub.workspaceId,
    clientId: sub.clientId,
    subscriptionId: sub.id,
    meter,
    quantity,
    occurredAt,
    idempotencyKey: key,
    source,
    createdAt: ctx.clock(),
  });
  unwrap(await repo.usage.append(event));
  return { recorded: true, replayed: false, meter, quantity, occurredAt };
}
