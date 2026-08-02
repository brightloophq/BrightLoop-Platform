/* =============================================================================
 * Integration Platform — Connector Registry (F4.1). PURE, additive catalogue.
 *
 * The marketplace of connector TYPES. Mirrors the AI Foundation MODEL_REGISTRY
 * pattern: a pure, in-memory, additive list indexed by a private Map, stable ids,
 * an `available` toggle. New connectors append; existing ids are never renumbered.
 *
 * IMPORTANT: this platform ships the FRAMEWORK, not vendor integrations. The only
 * connector with a live adapter is the deterministic `fake-connector` used by the
 * framework + tests. The other entries are neutral, vendor-agnostic EXAMPLES that
 * demonstrate the auth/trigger shapes (available:false — no adapter, cannot be
 * installed). No Gmail/Slack/Shopify/Stripe/etc. is implemented here.
 * ========================================================================== */

import { connectorDescriptorSchema, type ConnectorDescriptor } from "@brightloop/schema";

/** Parse-and-freeze a descriptor literal (fills defaults, validates shape). */
const d = (raw: unknown): ConnectorDescriptor => Object.freeze(connectorDescriptorSchema.parse(raw));

/**
 * The canonical connector registry. Append-only; ids are stable identifiers.
 */
export const CONNECTOR_REGISTRY: readonly ConnectorDescriptor[] = Object.freeze([
  d({
    id: "fake-connector",
    name: "Fake Connector",
    category: "custom",
    summary: "A deterministic reference connector that exercises the whole framework — auth, health, webhooks, polling, and event translation — with no network.",
    vendor: "Auxion",
    authMethod: "api_key",
    triggerKinds: ["webhook", "polling"],
    available: true,
    version: 1,
    configFields: [
      { key: "workspaceRef", label: "Workspace reference", type: "string", required: true },
      { key: "region", label: "Region", type: "enum", options: ["us", "eu"], required: false },
      { key: "apiKey", label: "API key", type: "secret", required: true, secret: true },
    ],
    capabilities: [
      { key: "records.read", label: "Read records", sideEffect: "read", operation: "list_records" },
      { key: "records.write", label: "Write records", sideEffect: "write", operation: "upsert_record" },
      { key: "events.subscribe", label: "Subscribe to events", sideEffect: "read", operation: "subscribe" },
    ],
  }),
  d({
    id: "fake-oauth",
    name: "Fake OAuth Connector",
    category: "custom",
    summary: "A deterministic OAuth2 reference connector that exercises the OAuth abstraction end to end — authorize URL, code exchange, token refresh — with no network.",
    vendor: "Auxion",
    authMethod: "oauth2",
    triggerKinds: ["polling"],
    available: true,
    version: 1,
    scopes: ["read", "offline_access"],
    configFields: [
      { key: "accountId", label: "Account ID", type: "string", required: true },
    ],
    capabilities: [
      { key: "items.read", label: "Read items", sideEffect: "read", operation: "list_items" },
    ],
  }),
  d({
    id: "example-oauth",
    name: "Example OAuth Provider",
    category: "productivity",
    summary: "A framework example of an OAuth2 connector. Demonstrates the OAuth abstraction (authorize URL, code exchange, token refresh). No live adapter.",
    vendor: "Example",
    authMethod: "oauth2",
    triggerKinds: ["polling"],
    available: false,
    version: 1,
    scopes: ["read", "offline_access"],
    configFields: [
      { key: "accountId", label: "Account ID", type: "string", required: true },
    ],
    capabilities: [
      { key: "items.read", label: "Read items", sideEffect: "read", operation: "list_items" },
    ],
  }),
  d({
    id: "example-webhook",
    name: "Example Webhook Source",
    category: "communication",
    summary: "A framework example of a webhook-driven connector. Demonstrates signature verification and event translation. No live adapter.",
    vendor: "Example",
    authMethod: "api_key",
    triggerKinds: ["webhook"],
    available: false,
    version: 1,
    configFields: [
      { key: "channel", label: "Channel", type: "string", required: false },
      { key: "signingSecret", label: "Signing secret", type: "secret", required: true, secret: true },
    ],
    capabilities: [
      { key: "events.subscribe", label: "Subscribe to events", sideEffect: "read", operation: "subscribe" },
    ],
  }),
  d({
    id: "example-polling",
    name: "Example Polling Source",
    category: "analytics",
    summary: "A framework example of a polling connector. Demonstrates cursor-based, replay-safe ingestion. No live adapter.",
    vendor: "Example",
    authMethod: "api_key",
    triggerKinds: ["polling"],
    available: false,
    version: 1,
    configFields: [
      { key: "datasetId", label: "Dataset ID", type: "string", required: true },
      { key: "apiKey", label: "API key", type: "secret", required: true, secret: true },
    ],
    capabilities: [
      { key: "metrics.read", label: "Read metrics", sideEffect: "read", operation: "list_metrics" },
    ],
  }),
]);

const BY_ID: ReadonlyMap<string, ConnectorDescriptor> = new Map(CONNECTOR_REGISTRY.map((c) => [c.id, c]));

/** Look up a connector descriptor by id, or null. Pure. */
export function findConnector(id: string): ConnectorDescriptor | null {
  return BY_ID.get(id) ?? null;
}

/** Whether a connector id exists in the registry. */
export function isKnownConnector(id: string): boolean {
  return BY_ID.has(id);
}

/** Whether a connector id exists AND has a live, installable adapter. */
export function isAvailableConnector(id: string): boolean {
  return BY_ID.get(id)?.available === true;
}

/** The full registry (optionally filtered to a category). */
export function listConnectors(category?: string): readonly ConnectorDescriptor[] {
  return category ? CONNECTOR_REGISTRY.filter((c) => c.category === category) : CONNECTOR_REGISTRY;
}

/** A capability descriptor on a connector, or null. */
export function findConnectorCapability(connectorId: string, capabilityKey: string) {
  return findConnector(connectorId)?.capabilities.find((c) => c.key === capabilityKey) ?? null;
}

/** Whether a connector declares a given trigger kind. */
export function connectorSupportsTrigger(connectorId: string, kind: string): boolean {
  return findConnector(connectorId)?.triggerKinds.includes(kind as never) === true;
}
