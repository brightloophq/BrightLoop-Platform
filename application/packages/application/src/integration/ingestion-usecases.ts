/* =============================================================================
 * Integration Platform — ingestion use-cases (F4.1).
 *
 * The two inbound paths every integration uses: WEBHOOK ingestion (verify
 * signature → translate → persist canonical events) and POLLING (cursor-based,
 * replay-safe). Both are IDEMPOTENT: a repeated webhook (same external event id)
 * or a repeated poll turn (same start cursor) returns the existing result and
 * writes no duplicate event. Website/provider content is untrusted DATA — it is
 * translated + sanitized, never obeyed.
 * ========================================================================== */

import {
  buildConnectorEvent, buildConnectorWebhookReceipt, buildPollingCursor, connectorWebhookKey,
  eventKey, normalizeConnectorFailure, normalizeTranslatedEvents, pollKey,
  type CanonicalConnectorEvent,
} from "@brightloop/domain";
import type { ConnectorEventSource } from "@brightloop/schema";
import { requireIntegration, INTEGRATION_INGEST_CAP, type AppContext } from "../context.js";
import { ConflictError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import { adapterFor, auditInstallation, loadInstallation, resolveConnectorSecret, resolveSigningSecret } from "./shared.js";
import type { PollDTO, WebhookIngestDTO } from "./dto.js";

const OPERABLE = new Set(["connected", "degraded"]);

/** Persist canonical events idempotently; returns how many were newly written. */
async function persistEvents(
  ctx: AppContext, installationId: string, workspaceId: string, clientId: string | null,
  connectorId: string, source: ConnectorEventSource, events: readonly CanonicalConnectorEvent[],
): Promise<number> {
  const repo = requireIntegration(ctx);
  let written = 0;
  for (const ev of events) {
    const key = eventKey(installationId, source, ev.externalId, ev.type);
    const prior = unwrap(await repo.events.findByIdempotencyKey(key));
    if (prior !== null) continue; // structural dedupe — replay-safe
    unwrap(await repo.events.append(buildConnectorEvent({
      id: ctx.ids("cevt"), connectorInstallationId: installationId, workspaceId, clientId, connectorId,
      type: ev.type, externalId: ev.externalId, source, occurredAt: ev.occurredAt, idempotencyKey: key,
      payload: ev.payload, provenance: ev.provenance, now: ctx.clock(),
    })));
    written += 1;
  }
  return written;
}

export interface IngestConnectorWebhookInput { installationId: string; rawBody: string; signature?: string | null; externalEventId?: string }

/** Ingest one webhook delivery: verify signature, translate, persist events (idempotent). */
export async function ingestConnectorWebhook(ctx: AppContext, input: IngestConnectorWebhookInput): Promise<WebhookIngestDTO> {
  const inst = await loadInstallation(ctx, requireId(input.installationId, "installationId"), INTEGRATION_INGEST_CAP);
  const rawBody = requireString(input.rawBody, "rawBody");
  if (inst.triggerKind !== "webhook") throw new ValidationError("This connector is not webhook-driven", { triggerKind: "not_webhook" });
  if (!OPERABLE.has(inst.status)) throw new ConflictError("The connector is not in an operable state");

  const adapter = adapterFor(ctx, inst.connectorId);
  if (adapter.verifyWebhook === undefined || adapter.translateWebhook === undefined) throw new ValidationError("This connector does not support webhooks", { connectorId: "no_webhook_support" });
  const repo = requireIntegration(ctx);
  const signingSecret = await resolveSigningSecret(ctx, inst);

  const verified = adapter.verifyWebhook({ connectorId: inst.connectorId, rawBody, signature: input.signature ?? null, signingSecret });
  if (!verified.ok || !verified.value.valid) {
    const externalEventId = input.externalEventId ?? "unverified";
    const key = connectorWebhookKey(inst.id, externalEventId);
    const receipt = unwrap(await repo.webhooks.append(buildConnectorWebhookReceipt({
      id: ctx.ids("cwhk"), connectorInstallationId: inst.id, workspaceId: inst.workspaceId, clientId: inst.clientId,
      connectorId: inst.connectorId, externalEventId, idempotencyKey: key, signatureValid: false, status: "rejected", eventCount: 0, now: ctx.clock(),
    })));
    await auditInstallation(ctx, inst, "webhook_ingest", inst.status, inst.status, "Rejected webhook (signature invalid)");
    return { receiptId: receipt.id, status: receipt.status, signatureValid: false, eventCount: 0 };
  }

  const externalEventId = verified.value.externalEventId;
  const key = connectorWebhookKey(inst.id, externalEventId);
  const prior = unwrap(await repo.webhooks.findByIdempotencyKey(key));
  if (prior !== null) return { receiptId: prior.id, status: "duplicate", signatureValid: prior.signatureValid, eventCount: prior.eventCount };

  const translated = adapter.translateWebhook({ connectorId: inst.connectorId, rawBody, source: "webhook" });
  if (!translated.ok) throw new ValidationError(normalizeConnectorFailure(translated.category).userMessage);
  const turn = normalizeTranslatedEvents(translated.value);
  const written = await persistEvents(ctx, inst.id, inst.workspaceId, inst.clientId, inst.connectorId, "webhook", turn.events);

  const receipt = unwrap(await repo.webhooks.append(buildConnectorWebhookReceipt({
    id: ctx.ids("cwhk"), connectorInstallationId: inst.id, workspaceId: inst.workspaceId, clientId: inst.clientId,
    connectorId: inst.connectorId, externalEventId, idempotencyKey: key, signatureValid: true, status: "processed", eventCount: written, now: ctx.clock(), processedAt: ctx.clock(),
  })));
  await auditInstallation(ctx, inst, "webhook_ingest", inst.status, inst.status, `Ingested webhook (${written} events)`);
  return { receiptId: receipt.id, status: receipt.status, signatureValid: true, eventCount: written };
}

export interface PollConnectorInput { installationId: string; limit?: number }

/** Run one polling turn: fetch since the last cursor, translate, persist (idempotent). */
export async function pollConnector(ctx: AppContext, input: PollConnectorInput): Promise<PollDTO> {
  const inst = await loadInstallation(ctx, requireId(input.installationId, "installationId"), INTEGRATION_INGEST_CAP);
  if (inst.triggerKind !== "polling") throw new ValidationError("This connector is not polling-driven", { triggerKind: "not_polling" });
  if (!OPERABLE.has(inst.status)) throw new ConflictError("The connector is not in an operable state");
  const adapter = adapterFor(ctx, inst.connectorId);
  if (adapter.poll === undefined) throw new ValidationError("This connector does not support polling", { connectorId: "no_poll_support" });
  const repo = requireIntegration(ctx);

  const fromCursor = inst.pollingCursor;
  const key = pollKey(inst.id, fromCursor);
  const prior = unwrap(await repo.cursors.findByIdempotencyKey(key));
  if (prior !== null) return { cursor: prior.toCursor, eventCount: prior.eventCount, sequence: prior.sequence };

  const limit = Math.min(Math.max(1, Math.trunc(input.limit ?? 50)), 500);
  const secret = await resolveConnectorSecret(ctx, inst, adapter);
  const res = await adapter.poll({ connectorId: inst.connectorId, authMethod: inst.authMethod, config: inst.config, secret, cursor: fromCursor, limit });
  if (!res.ok) throw new ValidationError(normalizeConnectorFailure(res.category).userMessage);

  const turn = normalizeTranslatedEvents(res.value.events);
  const written = await persistEvents(ctx, inst.id, inst.workspaceId, inst.clientId, inst.connectorId, "polling", turn.events);

  const latest = unwrap(await repo.cursors.latest(inst.id));
  const sequence = (latest?.sequence ?? 0) + 1;
  unwrap(await repo.cursors.append(buildPollingCursor({
    id: ctx.ids("ccur"), connectorInstallationId: inst.id, workspaceId: inst.workspaceId, clientId: inst.clientId,
    fromCursor, toCursor: res.value.nextCursor, eventCount: written, sequence, idempotencyKey: key, now: ctx.clock(),
  })));
  unwrap(await repo.installations.save({ ...inst, pollingCursor: res.value.nextCursor, version: inst.version + 1, updatedAt: ctx.clock() }, inst.version));
  await auditInstallation(ctx, inst, "poll", inst.status, inst.status, `Polled (${written} events)`);
  return { cursor: res.value.nextCursor, eventCount: written, sequence };
}
