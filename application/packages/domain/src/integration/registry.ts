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
