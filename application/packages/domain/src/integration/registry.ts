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

  /* ---- Communication family (F4.3) — NORMALIZED capabilities ---------------
   * All three providers expose the SAME `communication.*` capability keys +
   * `operation` names; each adapter maps the normalized operation onto its own
   * API. No provider-specific capability is exposed. Slack + Teams use OAuth2;
   * Discord uses bot-token (api_key) authentication. */
  d({
    id: "slack",
    name: "Slack",
    category: "communication",
    summary: "Post, update, delete, and thread messages; list channels + members; search + read history in a connected Slack workspace. Polls a channel and translates messages into normalized Auxion communication events.",
    vendor: "Slack",
    authMethod: "oauth2",
    triggerKinds: ["polling"],
    available: true,
    version: 1,
    scopes: ["channels:read", "channels:history", "chat:write", "users:read", "search:read", "groups:read"],
    configFields: [
      { key: "channelId", label: "Channel to monitor", type: "string", required: false, helpText: "Channel id polled for new messages." },
    ],
    capabilities: [
      { key: "communication.send_message", label: "Send message", sideEffect: "external", operation: "communication.send_message" },
      { key: "communication.reply_message", label: "Thread reply", sideEffect: "external", operation: "communication.reply_message" },
      { key: "communication.edit_message", label: "Update message", sideEffect: "write", operation: "communication.edit_message" },
      { key: "communication.delete_message", label: "Delete message", sideEffect: "write", operation: "communication.delete_message" },
      { key: "communication.list_channels", label: "List channels", sideEffect: "read", operation: "communication.list_channels" },
      { key: "communication.list_members", label: "List members", sideEffect: "read", operation: "communication.list_members" },
      { key: "communication.search_messages", label: "Search messages", sideEffect: "read", operation: "communication.search_messages" },
      { key: "communication.read_history", label: "Read channel history", sideEffect: "read", operation: "communication.read_history" },
      { key: "communication.list_containers", label: "Workspace info", sideEffect: "read", operation: "communication.list_containers" },
    ],
  }),
  d({
    id: "microsoft-teams",
    name: "Microsoft Teams",
    category: "communication",
    summary: "Discover teams + channels + members, post + reply to channel messages, read history, and read meeting metadata in Microsoft Teams (Graph). Polls a channel into normalized Auxion communication events.",
    vendor: "Microsoft",
    authMethod: "oauth2",
    triggerKinds: ["polling"],
    available: true,
    version: 1,
    scopes: ["offline_access", "Team.ReadBasic.All", "Channel.ReadBasic.All", "ChannelMessage.Send", "ChannelMessage.Read.All", "OnlineMeetings.Read"],
    configFields: [
      { key: "teamId", label: "Team", type: "string", required: false },
      { key: "channelId", label: "Channel to monitor", type: "string", required: false },
    ],
    capabilities: [
      { key: "communication.list_containers", label: "List teams", sideEffect: "read", operation: "communication.list_containers" },
      { key: "communication.list_channels", label: "List channels", sideEffect: "read", operation: "communication.list_channels" },
      { key: "communication.list_members", label: "List members", sideEffect: "read", operation: "communication.list_members" },
      { key: "communication.send_message", label: "Send message", sideEffect: "external", operation: "communication.send_message" },
      { key: "communication.reply_message", label: "Thread reply", sideEffect: "external", operation: "communication.reply_message" },
      { key: "communication.read_history", label: "Read history", sideEffect: "read", operation: "communication.read_history" },
      { key: "communication.meeting_metadata", label: "Meeting metadata", sideEffect: "read", operation: "communication.meeting_metadata" },
    ],
  }),
  d({
    id: "discord",
    name: "Discord",
    category: "communication",
    summary: "Bot-authenticated: discover guilds + channels + members, send + reply to messages (with thread support) in a Discord server. Polls a channel into normalized Auxion communication events.",
    vendor: "Discord",
    authMethod: "api_key",
    triggerKinds: ["polling"],
    available: true,
    version: 1,
    configFields: [
      { key: "botToken", label: "Bot token", type: "secret", required: true, secret: true, helpText: "Discord bot token (stored only by reference)." },
      { key: "guildId", label: "Server (guild) id", type: "string", required: false },
      { key: "channelId", label: "Channel to monitor", type: "string", required: false },
    ],
    capabilities: [
      { key: "communication.list_containers", label: "List servers", sideEffect: "read", operation: "communication.list_containers" },
      { key: "communication.list_channels", label: "List channels", sideEffect: "read", operation: "communication.list_channels" },
      { key: "communication.list_members", label: "List members", sideEffect: "read", operation: "communication.list_members" },
      { key: "communication.send_message", label: "Send message", sideEffect: "external", operation: "communication.send_message" },
      { key: "communication.reply_message", label: "Reply / thread", sideEffect: "external", operation: "communication.reply_message" },
      { key: "communication.read_history", label: "Read history", sideEffect: "read", operation: "communication.read_history" },
    ],
  }),

  /* ---- CRM family (F4.5) — NORMALIZED capabilities -------------------------
   * HubSpot / Salesforce / Pipedrive each expose a SUBSET of the shared `crm.*`
   * capability keys + `operation` names; each adapter maps the normalized operation
   * onto its own API. No provider-specific capability, query, or payload is exposed.
   * All three use OAuth 2.0 authorization-code auth (app-level client creds injected
   * from the environment; access/refresh tokens stored ONLY by reference). Salesforce
   * is polling-only (no first-class webhook signature); HubSpot + Pipedrive translate
   * provider events into normalized `crm.*` events. Salesforce/Pipedrive carry their
   * instance/company domain as install config (the API base URL is provider-specific
   * and only known post-authorization). The optional `webhookSigningSecret` secret
   * field (HubSpot/Pipedrive) verifies inbound webhook signatures. */
  d({
    id: "hubspot",
    name: "HubSpot",
    category: "crm",
    summary: "Read portal info, contacts, companies, deals, pipelines + stages, owners, and activities; search, create, update, and archive records; add notes + activities. Webhooks translate CRM object changes into normalized Auxion CRM events.",
    vendor: "HubSpot",
    authMethod: "oauth2",
    triggerKinds: ["webhook", "polling"],
    available: true,
    version: 1,
    scopes: ["oauth", "crm.objects.contacts.read", "crm.objects.contacts.write", "crm.objects.companies.read", "crm.objects.companies.write", "crm.objects.deals.read", "crm.objects.deals.write", "crm.objects.owners.read", "crm.schemas.deals.read"],
    configFields: [
      { key: "webhookSigningSecret", label: "Webhook client secret", type: "secret", required: false, secret: true, helpText: "HubSpot app client secret used to verify inbound webhook signatures (stored only by reference)." },
    ],
    capabilities: [
      { key: "crm.account.read", label: "Portal information", sideEffect: "read", operation: "crm.account.read" },
      { key: "crm.contacts.list", label: "List contacts", sideEffect: "read", operation: "crm.contacts.list" },
      { key: "crm.contacts.read", label: "Read contact", sideEffect: "read", operation: "crm.contacts.read" },
      { key: "crm.contacts.search", label: "Search contacts", sideEffect: "read", operation: "crm.contacts.search" },
      { key: "crm.contacts.create", label: "Create contact", sideEffect: "write", operation: "crm.contacts.create" },
      { key: "crm.contacts.update", label: "Update contact", sideEffect: "write", operation: "crm.contacts.update" },
      { key: "crm.contacts.archive", label: "Archive contact", sideEffect: "write", operation: "crm.contacts.archive" },
      { key: "crm.companies.list", label: "List companies", sideEffect: "read", operation: "crm.companies.list" },
      { key: "crm.companies.read", label: "Read company", sideEffect: "read", operation: "crm.companies.read" },
      { key: "crm.companies.search", label: "Search companies", sideEffect: "read", operation: "crm.companies.search" },
      { key: "crm.companies.create", label: "Create company", sideEffect: "write", operation: "crm.companies.create" },
      { key: "crm.companies.update", label: "Update company", sideEffect: "write", operation: "crm.companies.update" },
      { key: "crm.deals.list", label: "List deals", sideEffect: "read", operation: "crm.deals.list" },
      { key: "crm.deals.read", label: "Read deal", sideEffect: "read", operation: "crm.deals.read" },
      { key: "crm.deals.search", label: "Search deals", sideEffect: "read", operation: "crm.deals.search" },
      { key: "crm.deals.create", label: "Create deal", sideEffect: "write", operation: "crm.deals.create" },
      { key: "crm.deals.update", label: "Update deal", sideEffect: "write", operation: "crm.deals.update" },
      { key: "crm.deals.stage.update", label: "Update deal stage", sideEffect: "write", operation: "crm.deals.stage.update" },
      { key: "crm.pipelines.list", label: "List pipelines", sideEffect: "read", operation: "crm.pipelines.list" },
      { key: "crm.pipeline.stages.list", label: "List pipeline stages", sideEffect: "read", operation: "crm.pipeline.stages.list" },
      { key: "crm.activities.list", label: "List activities", sideEffect: "read", operation: "crm.activities.list" },
      { key: "crm.activity.create", label: "Create activity", sideEffect: "write", operation: "crm.activity.create" },
      { key: "crm.notes.create", label: "Create note", sideEffect: "write", operation: "crm.notes.create" },
      { key: "crm.owners.list", label: "List owners", sideEffect: "read", operation: "crm.owners.list" },
      { key: "crm.health", label: "Health", sideEffect: "read", operation: "crm.health" },
    ],
  }),
  d({
    id: "salesforce",
    name: "Salesforce",
    category: "crm",
    summary: "Read organization info, contacts, accounts, leads, opportunities + stages, users, and tasks through a safe allowlisted query layer; create + update records; add notes + tasks. Polling translates record changes into normalized Auxion CRM events. No raw SOQL is ever accepted.",
    vendor: "Salesforce",
    authMethod: "oauth2",
    triggerKinds: ["polling"],
    available: true,
    version: 1,
    scopes: ["api", "refresh_token", "offline_access"],
    configFields: [
      { key: "instanceUrl", label: "Instance URL (My Domain)", type: "url", required: true, helpText: "e.g. https://your-org.my.salesforce.com — the API base returned by Salesforce at authorization." },
      { key: "apiVersion", label: "API version", type: "string", required: false, helpText: "Defaults to v59.0." },
    ],
    capabilities: [
      { key: "crm.account.read", label: "Organization information", sideEffect: "read", operation: "crm.account.read" },
      { key: "crm.contacts.list", label: "List contacts", sideEffect: "read", operation: "crm.contacts.list" },
      { key: "crm.contacts.read", label: "Read contact", sideEffect: "read", operation: "crm.contacts.read" },
      { key: "crm.contacts.search", label: "Search contacts", sideEffect: "read", operation: "crm.contacts.search" },
      { key: "crm.contacts.create", label: "Create contact", sideEffect: "write", operation: "crm.contacts.create" },
      { key: "crm.contacts.update", label: "Update contact", sideEffect: "write", operation: "crm.contacts.update" },
      { key: "crm.companies.list", label: "List accounts", sideEffect: "read", operation: "crm.companies.list" },
      { key: "crm.companies.read", label: "Read account", sideEffect: "read", operation: "crm.companies.read" },
      { key: "crm.companies.search", label: "Search accounts", sideEffect: "read", operation: "crm.companies.search" },
      { key: "crm.companies.create", label: "Create account", sideEffect: "write", operation: "crm.companies.create" },
      { key: "crm.companies.update", label: "Update account", sideEffect: "write", operation: "crm.companies.update" },
      { key: "crm.leads.list", label: "List leads", sideEffect: "read", operation: "crm.leads.list" },
      { key: "crm.leads.read", label: "Read lead", sideEffect: "read", operation: "crm.leads.read" },
      { key: "crm.deals.list", label: "List opportunities", sideEffect: "read", operation: "crm.deals.list" },
      { key: "crm.deals.read", label: "Read opportunity", sideEffect: "read", operation: "crm.deals.read" },
      { key: "crm.deals.search", label: "Search opportunities", sideEffect: "read", operation: "crm.deals.search" },
      { key: "crm.deals.create", label: "Create opportunity", sideEffect: "write", operation: "crm.deals.create" },
      { key: "crm.deals.update", label: "Update opportunity", sideEffect: "write", operation: "crm.deals.update" },
      { key: "crm.deals.stage.update", label: "Update opportunity stage", sideEffect: "write", operation: "crm.deals.stage.update" },
      { key: "crm.pipelines.list", label: "List pipelines", sideEffect: "read", operation: "crm.pipelines.list" },
      { key: "crm.pipeline.stages.list", label: "List opportunity stages", sideEffect: "read", operation: "crm.pipeline.stages.list" },
      { key: "crm.activities.list", label: "List tasks", sideEffect: "read", operation: "crm.activities.list" },
      { key: "crm.activity.create", label: "Create task", sideEffect: "write", operation: "crm.activity.create" },
      { key: "crm.notes.create", label: "Create note", sideEffect: "write", operation: "crm.notes.create" },
      { key: "crm.owners.list", label: "List users", sideEffect: "read", operation: "crm.owners.list" },
      { key: "crm.health", label: "Health", sideEffect: "read", operation: "crm.health" },
    ],
  }),
  d({
    id: "pipedrive",
    name: "Pipedrive",
    category: "crm",
    summary: "Read current user + company, persons, organizations, deals, pipelines + stages, activities, and users; search, create, and update records; add notes + activities. Webhooks translate record changes into normalized Auxion CRM events.",
    vendor: "Pipedrive",
    authMethod: "oauth2",
    triggerKinds: ["webhook", "polling"],
    available: true,
    version: 1,
    scopes: ["base", "contacts:full", "deals:full", "activities:full", "users:read"],
    configFields: [
      { key: "companyDomain", label: "Company domain", type: "string", required: false, helpText: "e.g. your-company (from your-company.pipedrive.com). Defaults to the shared API host." },
      { key: "webhookSigningSecret", label: "Webhook HTTP-auth secret", type: "secret", required: false, secret: true, helpText: "Shared secret used to verify inbound webhook Basic-auth (stored only by reference)." },
    ],
    capabilities: [
      { key: "crm.account.read", label: "Current user + company", sideEffect: "read", operation: "crm.account.read" },
      { key: "crm.contacts.list", label: "List persons", sideEffect: "read", operation: "crm.contacts.list" },
      { key: "crm.contacts.read", label: "Read person", sideEffect: "read", operation: "crm.contacts.read" },
      { key: "crm.contacts.search", label: "Search persons", sideEffect: "read", operation: "crm.contacts.search" },
      { key: "crm.contacts.create", label: "Create person", sideEffect: "write", operation: "crm.contacts.create" },
      { key: "crm.contacts.update", label: "Update person", sideEffect: "write", operation: "crm.contacts.update" },
      { key: "crm.companies.list", label: "List organizations", sideEffect: "read", operation: "crm.companies.list" },
      { key: "crm.companies.read", label: "Read organization", sideEffect: "read", operation: "crm.companies.read" },
      { key: "crm.companies.search", label: "Search organizations", sideEffect: "read", operation: "crm.companies.search" },
      { key: "crm.companies.create", label: "Create organization", sideEffect: "write", operation: "crm.companies.create" },
      { key: "crm.companies.update", label: "Update organization", sideEffect: "write", operation: "crm.companies.update" },
      { key: "crm.deals.list", label: "List deals", sideEffect: "read", operation: "crm.deals.list" },
      { key: "crm.deals.read", label: "Read deal", sideEffect: "read", operation: "crm.deals.read" },
      { key: "crm.deals.search", label: "Search deals", sideEffect: "read", operation: "crm.deals.search" },
      { key: "crm.deals.create", label: "Create deal", sideEffect: "write", operation: "crm.deals.create" },
      { key: "crm.deals.update", label: "Update deal", sideEffect: "write", operation: "crm.deals.update" },
      { key: "crm.deals.stage.update", label: "Update deal stage", sideEffect: "write", operation: "crm.deals.stage.update" },
      { key: "crm.pipelines.list", label: "List pipelines", sideEffect: "read", operation: "crm.pipelines.list" },
      { key: "crm.pipeline.stages.list", label: "List pipeline stages", sideEffect: "read", operation: "crm.pipeline.stages.list" },
      { key: "crm.activities.list", label: "List activities", sideEffect: "read", operation: "crm.activities.list" },
      { key: "crm.activity.create", label: "Create activity", sideEffect: "write", operation: "crm.activity.create" },
      { key: "crm.notes.create", label: "Create note", sideEffect: "write", operation: "crm.notes.create" },
      { key: "crm.owners.list", label: "List users", sideEffect: "read", operation: "crm.owners.list" },
      { key: "crm.health", label: "Health", sideEffect: "read", operation: "crm.health" },
    ],
  }),
  /* Finance connectors (F4.6). QuickBooks Online + Xero expose a NORMALIZED finance.*
   * capability vocabulary over the F4.1 platform. Both are OAuth 2.0 authorization-code
   * connectors that carry their tenancy as install config (QuickBooks realmId +
   * environment; Xero tenantId — the API tenancy is provider-specific and only known
   * post-authorization). The optional `webhookSigningSecret` secret field verifies the
   * inbound HMAC-SHA256 (base64) webhook signature. No provider query language is ever
   * exposed: QuickBooks reads go through an allowlisted internal query builder; Xero uses
   * fixed REST endpoints. */
  d({
    id: "quickbooks",
    name: "QuickBooks Online",
    category: "finance",
    summary: "Read company info, chart of accounts, customers, invoices, payments, expenses, items, and tax rates; create customers, invoices, payments, expenses, and items; refund a payment. Webhooks translate accounting changes into normalized Auxion finance events. No raw QuickBooks query is ever accepted.",
    vendor: "Intuit",
    authMethod: "oauth2",
    triggerKinds: ["webhook", "polling"],
    available: true,
    version: 1,
    scopes: ["com.intuit.quickbooks.accounting", "openid", "offline_access"],
    configFields: [
      { key: "realmId", label: "Company ID (realmId)", type: "string", required: true, helpText: "The QuickBooks company id returned on the authorization redirect." },
      { key: "environment", label: "Environment", type: "enum", options: ["production", "sandbox"], required: false, helpText: "Defaults to production." },
      { key: "webhookSigningSecret", label: "Webhook verifier token", type: "secret", required: false, secret: true, helpText: "Intuit webhook verifier token used to verify inbound signatures (stored only by reference)." },
    ],
    capabilities: [
      { key: "finance.company.read", label: "Company information", sideEffect: "read", operation: "finance.company.read" },
      { key: "finance.accounts.list", label: "List accounts", sideEffect: "read", operation: "finance.accounts.list" },
      { key: "finance.customers.list", label: "List customers", sideEffect: "read", operation: "finance.customers.list" },
      { key: "finance.customers.read", label: "Read customer", sideEffect: "read", operation: "finance.customers.read" },
      { key: "finance.customers.create", label: "Create customer", sideEffect: "write", operation: "finance.customers.create" },
      { key: "finance.invoices.list", label: "List invoices", sideEffect: "read", operation: "finance.invoices.list" },
      { key: "finance.invoices.read", label: "Read invoice", sideEffect: "read", operation: "finance.invoices.read" },
      { key: "finance.invoices.create", label: "Create invoice", sideEffect: "write", operation: "finance.invoices.create" },
      { key: "finance.invoices.update", label: "Update invoice", sideEffect: "write", operation: "finance.invoices.update" },
      { key: "finance.payments.list", label: "List payments", sideEffect: "read", operation: "finance.payments.list" },
      { key: "finance.payments.read", label: "Read payment", sideEffect: "read", operation: "finance.payments.read" },
      { key: "finance.payments.create", label: "Create payment", sideEffect: "write", operation: "finance.payments.create" },
      { key: "finance.payments.refund", label: "Refund payment", sideEffect: "write", operation: "finance.payments.refund" },
      { key: "finance.expenses.list", label: "List expenses", sideEffect: "read", operation: "finance.expenses.list" },
      { key: "finance.expenses.read", label: "Read expense", sideEffect: "read", operation: "finance.expenses.read" },
      { key: "finance.expenses.create", label: "Create expense", sideEffect: "write", operation: "finance.expenses.create" },
      { key: "finance.items.list", label: "List items", sideEffect: "read", operation: "finance.items.list" },
      { key: "finance.items.read", label: "Read item", sideEffect: "read", operation: "finance.items.read" },
      { key: "finance.items.create", label: "Create item", sideEffect: "write", operation: "finance.items.create" },
      { key: "finance.taxes.list", label: "List tax rates", sideEffect: "read", operation: "finance.taxes.list" },
      { key: "finance.health", label: "Health", sideEffect: "read", operation: "finance.health" },
    ],
  }),
  d({
    id: "xero",
    name: "Xero",
    category: "finance",
    summary: "Read organisation info, accounts, contacts, invoices, payments, bank-transaction expenses, items, and tax rates; create contacts, invoices, payments, expenses, and items. Multi-tenant: the selected organisation is carried as install config. Webhooks translate accounting changes into normalized Auxion finance events.",
    vendor: "Xero",
    authMethod: "oauth2",
    triggerKinds: ["webhook", "polling"],
    available: true,
    version: 1,
    scopes: ["offline_access", "accounting.transactions", "accounting.contacts", "accounting.settings"],
    configFields: [
      { key: "tenantId", label: "Organisation (tenant) ID", type: "string", required: true, helpText: "The Xero tenant id selected after authorization (from /connections)." },
      { key: "webhookSigningSecret", label: "Webhook signing key", type: "secret", required: false, secret: true, helpText: "Xero webhook signing key used to verify inbound signatures (stored only by reference)." },
    ],
    capabilities: [
      { key: "finance.company.read", label: "Organisation information", sideEffect: "read", operation: "finance.company.read" },
      { key: "finance.accounts.list", label: "List accounts", sideEffect: "read", operation: "finance.accounts.list" },
      { key: "finance.customers.list", label: "List contacts", sideEffect: "read", operation: "finance.customers.list" },
      { key: "finance.customers.read", label: "Read contact", sideEffect: "read", operation: "finance.customers.read" },
      { key: "finance.customers.create", label: "Create contact", sideEffect: "write", operation: "finance.customers.create" },
      { key: "finance.invoices.list", label: "List invoices", sideEffect: "read", operation: "finance.invoices.list" },
      { key: "finance.invoices.read", label: "Read invoice", sideEffect: "read", operation: "finance.invoices.read" },
      { key: "finance.invoices.create", label: "Create invoice", sideEffect: "write", operation: "finance.invoices.create" },
      { key: "finance.invoices.update", label: "Update invoice", sideEffect: "write", operation: "finance.invoices.update" },
      { key: "finance.payments.list", label: "List payments", sideEffect: "read", operation: "finance.payments.list" },
      { key: "finance.payments.read", label: "Read payment", sideEffect: "read", operation: "finance.payments.read" },
      { key: "finance.payments.create", label: "Create payment", sideEffect: "write", operation: "finance.payments.create" },
      { key: "finance.expenses.list", label: "List expenses", sideEffect: "read", operation: "finance.expenses.list" },
      { key: "finance.expenses.read", label: "Read expense", sideEffect: "read", operation: "finance.expenses.read" },
      { key: "finance.expenses.create", label: "Create expense", sideEffect: "write", operation: "finance.expenses.create" },
      { key: "finance.items.list", label: "List items", sideEffect: "read", operation: "finance.items.list" },
      { key: "finance.items.read", label: "Read item", sideEffect: "read", operation: "finance.items.read" },
      { key: "finance.items.create", label: "Create item", sideEffect: "write", operation: "finance.items.create" },
      { key: "finance.taxes.list", label: "List tax rates", sideEffect: "read", operation: "finance.taxes.list" },
      { key: "finance.health", label: "Health", sideEffect: "read", operation: "finance.health" },
    ],
  }),

  /* ---- Social family (F4.7) — NORMALIZED capabilities ----------------------
   * Meta (Facebook + Instagram) / LinkedIn / X (Twitter) / TikTok each expose a
   * SUBSET of the shared `social.*` capability keys + `operation` names; each adapter
   * maps the normalized operation onto its own API. No provider-specific capability,
   * query, or payload is exposed. All four use OAuth 2.0 authorization-code auth
   * (app-level client creds injected from the environment — TikTok's credential is a
   * `client_key`; access/refresh tokens stored ONLY by reference). Meta is the only
   * provider with a body-signed webhook (X-Hub-Signature-256) the sync port can verify;
   * LinkedIn/X/TikTok are polling-only. Provider-specific normalized subsets are
   * documented asymmetries: only Meta lists Pages + reads insights; only X exposes
   * search; Meta + TikTok publish, others create. The optional `webhookSigningSecret`
   * (Meta) verifies the inbound HMAC-SHA256 (hex) webhook signature. */
  d({
    id: "meta",
    name: "Meta (Facebook + Instagram)",
    category: "social",
    summary: "Read the connected profile, Facebook Pages, and linked Instagram Business accounts; list, read, create, publish (immediate or scheduled), and delete posts; list + reply to comments; upload media; read post insights. Webhooks translate page/Instagram changes into normalized Auxion social events.",
    vendor: "Meta",
    authMethod: "oauth2",
    triggerKinds: ["webhook", "polling"],
    available: true,
    version: 1,
    scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish", "read_insights", "business_management"],
    configFields: [
      { key: "pageId", label: "Default Facebook Page ID", type: "string", required: false, helpText: "Page id used as the default target for posts + polling." },
      { key: "instagramBusinessId", label: "Instagram Business account ID", type: "string", required: false, helpText: "Linked Instagram Business account id." },
      { key: "apiVersion", label: "Graph API version", type: "string", required: false, helpText: "Defaults to v21.0." },
      { key: "webhookSigningSecret", label: "App secret (webhook)", type: "secret", required: false, secret: true, helpText: "Meta app secret used to verify X-Hub-Signature-256 webhook signatures (stored only by reference)." },
    ],
    capabilities: [
      { key: "social.profile.read", label: "Read profile", sideEffect: "read", operation: "social.profile.read" },
      { key: "social.pages.list", label: "List Pages", sideEffect: "read", operation: "social.pages.list" },
      { key: "social.accounts.list", label: "List Instagram accounts", sideEffect: "read", operation: "social.accounts.list" },
      { key: "social.posts.list", label: "List posts", sideEffect: "read", operation: "social.posts.list" },
      { key: "social.posts.read", label: "Read post", sideEffect: "read", operation: "social.posts.read" },
      { key: "social.posts.create", label: "Create post", sideEffect: "write", operation: "social.posts.create" },
      { key: "social.posts.publish", label: "Publish post", sideEffect: "external", operation: "social.posts.publish" },
      { key: "social.posts.delete", label: "Delete post", sideEffect: "write", operation: "social.posts.delete" },
      { key: "social.comments.list", label: "List comments", sideEffect: "read", operation: "social.comments.list" },
      { key: "social.comments.reply", label: "Reply to comment", sideEffect: "external", operation: "social.comments.reply" },
      { key: "social.media.upload", label: "Upload media", sideEffect: "external", operation: "social.media.upload" },
      { key: "social.insights.read", label: "Read insights", sideEffect: "read", operation: "social.insights.read" },
      { key: "social.health", label: "Health", sideEffect: "read", operation: "social.health" },
    ],
  }),
  d({
    id: "linkedin",
    name: "LinkedIn",
    category: "social",
    summary: "Read the member profile + administered Organizations; list, read, create, and delete organization posts; list + reply to comments; initialize media uploads; read organization share analytics. Polling translates new organization posts into normalized Auxion social events.",
    vendor: "LinkedIn",
    authMethod: "oauth2",
    triggerKinds: ["polling"],
    available: true,
    version: 1,
    scopes: ["openid", "profile", "email", "w_member_social", "r_organization_social", "w_organization_social", "rw_organization_admin"],
    configFields: [
      { key: "organizationId", label: "Organization URN", type: "string", required: false, helpText: "e.g. urn:li:organization:12345 — the default author for posts + polling." },
      { key: "apiVersion", label: "LinkedIn-Version", type: "string", required: false, helpText: "Versioned API date; defaults to 202401." },
    ],
    capabilities: [
      { key: "social.profile.read", label: "Read profile", sideEffect: "read", operation: "social.profile.read" },
      { key: "social.accounts.list", label: "List organizations", sideEffect: "read", operation: "social.accounts.list" },
      { key: "social.posts.list", label: "List posts", sideEffect: "read", operation: "social.posts.list" },
      { key: "social.posts.read", label: "Read post", sideEffect: "read", operation: "social.posts.read" },
      { key: "social.posts.create", label: "Create post", sideEffect: "write", operation: "social.posts.create" },
      { key: "social.posts.delete", label: "Delete post", sideEffect: "write", operation: "social.posts.delete" },
      { key: "social.comments.list", label: "List comments", sideEffect: "read", operation: "social.comments.list" },
      { key: "social.comments.reply", label: "Reply to comment", sideEffect: "external", operation: "social.comments.reply" },
      { key: "social.media.upload", label: "Upload media", sideEffect: "external", operation: "social.media.upload" },
      { key: "social.analytics.read", label: "Read analytics", sideEffect: "read", operation: "social.analytics.read" },
      { key: "social.health", label: "Health", sideEffect: "read", operation: "social.health" },
    ],
  }),
  d({
    id: "x",
    name: "X (Twitter)",
    category: "social",
    summary: "Read the authenticated profile; list, read, create, and delete tweets; reply to tweets; upload media; search recent tweets; read public tweet metrics. Polling translates new tweets into normalized Auxion social events.",
    vendor: "X",
    authMethod: "oauth2",
    triggerKinds: ["polling"],
    available: true,
    version: 1,
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    configFields: [
      { key: "userId", label: "Default author user ID", type: "string", required: false, helpText: "X user id used as the default author for listing + polling." },
    ],
    capabilities: [
      { key: "social.profile.read", label: "Read profile", sideEffect: "read", operation: "social.profile.read" },
      { key: "social.posts.list", label: "List tweets", sideEffect: "read", operation: "social.posts.list" },
      { key: "social.posts.read", label: "Read tweet", sideEffect: "read", operation: "social.posts.read" },
      { key: "social.posts.create", label: "Create tweet", sideEffect: "external", operation: "social.posts.create" },
      { key: "social.posts.delete", label: "Delete tweet", sideEffect: "write", operation: "social.posts.delete" },
      { key: "social.comments.reply", label: "Reply to tweet", sideEffect: "external", operation: "social.comments.reply" },
      { key: "social.media.upload", label: "Upload media", sideEffect: "external", operation: "social.media.upload" },
      { key: "social.search.read", label: "Search tweets", sideEffect: "read", operation: "social.search.read" },
      { key: "social.analytics.read", label: "Read analytics", sideEffect: "read", operation: "social.analytics.read" },
      { key: "social.health", label: "Health", sideEffect: "read", operation: "social.health" },
    ],
  }),
  d({
    id: "tiktok",
    name: "TikTok",
    category: "social",
    summary: "Read the connected business account profile; list + read videos; publish videos through the Content Posting API; initialize media uploads; read per-video analytics. Polling translates new videos into normalized Auxion social events.",
    vendor: "TikTok",
    authMethod: "oauth2",
    triggerKinds: ["polling"],
    available: true,
    version: 1,
    scopes: ["user.info.basic", "user.info.profile", "user.info.stats", "video.list", "video.publish", "video.upload"],
    configFields: [
      { key: "businessId", label: "Business account ID", type: "string", required: false, helpText: "TikTok business account id (optional; defaults to the authorized account)." },
    ],
    capabilities: [
      { key: "social.profile.read", label: "Read profile", sideEffect: "read", operation: "social.profile.read" },
      { key: "social.accounts.list", label: "List accounts", sideEffect: "read", operation: "social.accounts.list" },
      { key: "social.posts.list", label: "List videos", sideEffect: "read", operation: "social.posts.list" },
      { key: "social.posts.read", label: "Read video", sideEffect: "read", operation: "social.posts.read" },
      { key: "social.posts.publish", label: "Publish video", sideEffect: "external", operation: "social.posts.publish" },
      { key: "social.media.upload", label: "Upload media", sideEffect: "external", operation: "social.media.upload" },
      { key: "social.analytics.read", label: "Read analytics", sideEffect: "read", operation: "social.analytics.read" },
      { key: "social.health", label: "Health", sideEffect: "read", operation: "social.health" },
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
