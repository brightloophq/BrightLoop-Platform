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

  /* ---- Google Workspace (F4.2) — the first production connectors ----------- */
  d({
    id: "google-gmail",
    name: "Gmail",
    category: "communication",
    summary: "Send, draft, read, search, label, thread, reply to, and archive email in a connected Google account. Polls for new messages and translates them into Auxion events.",
    vendor: "Google",
    authMethod: "oauth2",
    triggerKinds: ["polling"],
    available: true,
    version: 1,
    scopes: [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    configFields: [
      { key: "userId", label: "Mailbox", type: "string", required: false, helpText: "Google mailbox id; defaults to the authorized account (\"me\")." },
    ],
    capabilities: [
      { key: "gmail.send", label: "Send email", sideEffect: "external", operation: "gmail.send" },
      { key: "gmail.draft", label: "Draft email", sideEffect: "write", operation: "gmail.draft" },
      { key: "gmail.read", label: "Read message", sideEffect: "read", operation: "gmail.messages.get" },
      { key: "gmail.search", label: "Search messages", sideEffect: "read", operation: "gmail.messages.search" },
      { key: "gmail.labels", label: "Labels", sideEffect: "read", operation: "gmail.labels.list" },
      { key: "gmail.threads", label: "Threads", sideEffect: "read", operation: "gmail.threads.get" },
      { key: "gmail.attachments", label: "Attachments", sideEffect: "read", operation: "gmail.attachments.get" },
      { key: "gmail.reply", label: "Reply", sideEffect: "external", operation: "gmail.reply" },
      { key: "gmail.archive", label: "Archive", sideEffect: "write", operation: "gmail.archive" },
    ],
  }),
  d({
    id: "google-calendar",
    name: "Google Calendar",
    category: "productivity",
    summary: "List calendars and events, create/update/delete events, check availability, and manage invitations. Polls for event changes and translates them into Auxion events.",
    vendor: "Google",
    authMethod: "oauth2",
    triggerKinds: ["polling"],
    available: true,
    version: 1,
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    configFields: [
      { key: "calendarId", label: "Calendar", type: "string", required: false, helpText: "Calendar id to poll; defaults to \"primary\"." },
    ],
    capabilities: [
      { key: "calendar.calendars.list", label: "List calendars", sideEffect: "read", operation: "calendar.calendars.list" },
      { key: "calendar.events.list", label: "List events", sideEffect: "read", operation: "calendar.events.list" },
      { key: "calendar.events.create", label: "Create event", sideEffect: "external", operation: "calendar.events.create" },
      { key: "calendar.events.update", label: "Update event", sideEffect: "write", operation: "calendar.events.update" },
      { key: "calendar.events.delete", label: "Delete event", sideEffect: "external", operation: "calendar.events.delete" },
      { key: "calendar.freebusy", label: "Availability", sideEffect: "read", operation: "calendar.freebusy" },
      { key: "calendar.events.invite", label: "Invitations", sideEffect: "external", operation: "calendar.events.invite" },
    ],
  }),
  d({
    id: "google-drive",
    name: "Google Drive",
    category: "storage",
    summary: "List, search, read metadata, download, upload, navigate folders, and inspect permissions in a connected Drive. Polls the change feed and translates changes into Auxion events.",
    vendor: "Google",
    authMethod: "oauth2",
    triggerKinds: ["polling"],
    available: true,
    version: 1,
    scopes: ["https://www.googleapis.com/auth/drive"],
    configFields: [],
    capabilities: [
      { key: "drive.files.list", label: "List files", sideEffect: "read", operation: "drive.files.list" },
      { key: "drive.files.search", label: "Search", sideEffect: "read", operation: "drive.files.search" },
      { key: "drive.files.get", label: "Read metadata", sideEffect: "read", operation: "drive.files.get" },
      { key: "drive.files.download", label: "Download", sideEffect: "read", operation: "drive.files.download" },
      { key: "drive.files.upload", label: "Upload", sideEffect: "external", operation: "drive.files.upload" },
      { key: "drive.folders.list", label: "Folder navigation", sideEffect: "read", operation: "drive.folders.list" },
      { key: "drive.permissions.list", label: "Permissions", sideEffect: "read", operation: "drive.permissions.list" },
    ],
  }),
  d({
    id: "google-contacts",
    name: "Google Contacts",
    category: "crm",
    summary: "List, search, and read contacts and their organizations from a connected Google account (People API).",
    vendor: "Google",
    authMethod: "oauth2",
    triggerKinds: [],
    available: true,
    version: 1,
    scopes: ["https://www.googleapis.com/auth/contacts.readonly"],
    configFields: [],
    capabilities: [
      { key: "contacts.list", label: "List contacts", sideEffect: "read", operation: "contacts.list" },
      { key: "contacts.search", label: "Search contacts", sideEffect: "read", operation: "contacts.search" },
      { key: "contacts.get", label: "Read contact", sideEffect: "read", operation: "contacts.get" },
      { key: "contacts.organizations", label: "Organizations", sideEffect: "read", operation: "contacts.organizations" },
    ],
  }),

  /* ---- Commerce family (F4.4) — NORMALIZED capabilities --------------------
   * Shopify / Stripe / PayPal each expose a SUBSET of the shared `commerce.*`
   * capability keys + `operation` names; each adapter maps the normalized operation
   * onto its own API. No provider-specific capability is exposed. All three use
   * per-installation API-key credentials (Shopify Admin token, Stripe secret key,
   * PayPal client-credentials) — no user-redirect OAuth. Webhooks translate provider
   * events into normalized `commerce.*` events. Config orders the primary credential
   * secret field BEFORE the (optional) webhook signing secret so it is the primary
   * reference (see application persistSecrets). */
  d({
    id: "shopify",
    name: "Shopify",
    category: "commerce",
    summary: "Read store info, products, collections, inventory, locations, customers, and orders; create/update products, orders, draft orders, fulfillments, checkouts, and refunds; read price rules + discount codes. Webhooks translate store events into normalized Auxion commerce events.",
    vendor: "Shopify",
    authMethod: "api_key",
    triggerKinds: ["webhook", "polling"],
    available: true,
    version: 1,
    configFields: [
      { key: "shopDomain", label: "Shop domain", type: "string", required: true, helpText: "e.g. my-store.myshopify.com" },
      { key: "apiVersion", label: "Admin API version", type: "string", required: false, helpText: "Defaults to 2024-01." },
      { key: "accessToken", label: "Admin API access token", type: "secret", required: true, secret: true, helpText: "Custom-app Admin API token (stored only by reference)." },
      { key: "webhookSigningSecret", label: "Webhook signing secret", type: "secret", required: false, secret: true, helpText: "App secret used to verify webhook HMAC (stored only by reference)." },
    ],
    capabilities: [
      { key: "commerce.store.read", label: "Store information", sideEffect: "read", operation: "commerce.store.read" },
      { key: "commerce.products.read", label: "Read products", sideEffect: "read", operation: "commerce.products.read" },
      { key: "commerce.products.write", label: "Write products", sideEffect: "write", operation: "commerce.products.write" },
      { key: "commerce.collections.read", label: "Read collections", sideEffect: "read", operation: "commerce.collections.read" },
      { key: "commerce.inventory.read", label: "Read inventory", sideEffect: "read", operation: "commerce.inventory.read" },
      { key: "commerce.locations.read", label: "Read locations", sideEffect: "read", operation: "commerce.locations.read" },
      { key: "commerce.customers.read", label: "Read customers", sideEffect: "read", operation: "commerce.customers.read" },
      { key: "commerce.orders.read", label: "Read orders", sideEffect: "read", operation: "commerce.orders.read" },
      { key: "commerce.orders.write", label: "Create orders", sideEffect: "external", operation: "commerce.orders.write" },
      { key: "commerce.draft_orders.write", label: "Create draft orders", sideEffect: "external", operation: "commerce.draft_orders.write" },
      { key: "commerce.fulfillments.write", label: "Create fulfillments", sideEffect: "external", operation: "commerce.fulfillments.write" },
      { key: "commerce.price_rules.read", label: "Read price rules", sideEffect: "read", operation: "commerce.price_rules.read" },
      { key: "commerce.discounts.read", label: "Read discount codes", sideEffect: "read", operation: "commerce.discounts.read" },
      { key: "commerce.checkout.create", label: "Create checkout", sideEffect: "external", operation: "commerce.checkout.create" },
      { key: "commerce.payments.refund", label: "Refund order", sideEffect: "external", operation: "commerce.payments.refund" },
      { key: "commerce.health", label: "Health", sideEffect: "read", operation: "commerce.health" },
    ],
  }),
  d({
    id: "stripe",
    name: "Stripe",
    category: "commerce",
    summary: "Read account, customers, products, prices, payment intents, invoices, subscriptions, disputes, balance, and events; capture and refund payments; create checkout sessions. Webhooks translate Stripe events into normalized Auxion commerce events.",
    vendor: "Stripe",
    authMethod: "api_key",
    triggerKinds: ["webhook", "polling"],
    available: true,
    version: 1,
    configFields: [
      { key: "apiVersion", label: "API version", type: "string", required: false },
      { key: "apiKey", label: "Secret API key", type: "secret", required: true, secret: true, helpText: "Stripe secret key sk_… (stored only by reference)." },
      { key: "webhookSigningSecret", label: "Webhook signing secret", type: "secret", required: false, secret: true, helpText: "Stripe webhook signing secret whsec_… (stored only by reference)." },
    ],
    capabilities: [
      { key: "commerce.store.read", label: "Account information", sideEffect: "read", operation: "commerce.store.read" },
      { key: "commerce.customers.read", label: "Read customers", sideEffect: "read", operation: "commerce.customers.read" },
      { key: "commerce.products.read", label: "Read products", sideEffect: "read", operation: "commerce.products.read" },
      { key: "commerce.products.write", label: "Create products", sideEffect: "write", operation: "commerce.products.write" },
      { key: "commerce.prices.read", label: "Read prices", sideEffect: "read", operation: "commerce.prices.read" },
      { key: "commerce.payments.read", label: "Read payment intents", sideEffect: "read", operation: "commerce.payments.read" },
      { key: "commerce.payments.capture", label: "Capture payment", sideEffect: "external", operation: "commerce.payments.capture" },
      { key: "commerce.payments.refund", label: "Refund payment", sideEffect: "external", operation: "commerce.payments.refund" },
      { key: "commerce.invoices.read", label: "Read invoices", sideEffect: "read", operation: "commerce.invoices.read" },
      { key: "commerce.subscriptions.read", label: "Read subscriptions", sideEffect: "read", operation: "commerce.subscriptions.read" },
      { key: "commerce.checkout.create", label: "Create checkout session", sideEffect: "external", operation: "commerce.checkout.create" },
      { key: "commerce.disputes.read", label: "Read disputes", sideEffect: "read", operation: "commerce.disputes.read" },
      { key: "commerce.balance.read", label: "Read balance", sideEffect: "read", operation: "commerce.balance.read" },
      { key: "commerce.events.read", label: "Read events", sideEffect: "read", operation: "commerce.events.read" },
      { key: "commerce.health", label: "Health", sideEffect: "read", operation: "commerce.health" },
    ],
  }),
  d({
    id: "paypal",
    name: "PayPal",
    category: "commerce",
    summary: "Read merchant info and transactions; create, authorize, capture, and read orders and payments; issue refunds. Client-credentials authenticated. Webhooks translate PayPal events into normalized Auxion commerce events.",
    vendor: "PayPal",
    authMethod: "api_key",
    triggerKinds: ["webhook"],
    available: true,
    version: 1,
    configFields: [
      { key: "clientId", label: "Client ID", type: "string", required: true },
      { key: "environment", label: "Environment", type: "enum", options: ["sandbox", "live"], required: true, helpText: "Defaults to sandbox." },
      { key: "clientSecret", label: "Client secret", type: "secret", required: true, secret: true, helpText: "PayPal REST app client secret (stored only by reference)." },
      { key: "webhookId", label: "Webhook ID", type: "string", required: false, helpText: "Configured PayPal webhook id used to gate inbound events." },
      { key: "webhookSigningSecret", label: "Webhook signing secret", type: "secret", required: false, secret: true, helpText: "Reserved for webhook verification (stored only by reference)." },
    ],
    capabilities: [
      { key: "commerce.store.read", label: "Merchant information", sideEffect: "read", operation: "commerce.store.read" },
      { key: "commerce.orders.read", label: "Read order", sideEffect: "read", operation: "commerce.orders.read" },
      { key: "commerce.orders.write", label: "Create order", sideEffect: "external", operation: "commerce.orders.write" },
      { key: "commerce.payments.authorize", label: "Authorize payment", sideEffect: "external", operation: "commerce.payments.authorize" },
      { key: "commerce.payments.capture", label: "Capture payment", sideEffect: "external", operation: "commerce.payments.capture" },
      { key: "commerce.payments.read", label: "Read payment", sideEffect: "read", operation: "commerce.payments.read" },
      { key: "commerce.payments.refund", label: "Refund payment", sideEffect: "external", operation: "commerce.payments.refund" },
      { key: "commerce.transactions.read", label: "Read transactions", sideEffect: "read", operation: "commerce.transactions.read" },
      { key: "commerce.health", label: "Health", sideEffect: "read", operation: "commerce.health" },
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
