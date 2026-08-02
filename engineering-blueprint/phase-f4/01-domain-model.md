# F4.1 · Domain model

All contracts are Zod in `@brightloop/schema/integration`; all logic is pure in
`@brightloop/domain/integration`. The domain is **Node-free** and **deterministic**
(`now` is always a parameter).

## Aggregates & entities

| Entity | Kind | Table | Notes |
|---|---|---|---|
| `ConnectorInstallation` | versioned root | `connector_installation` | one per (workspace, connector); optimistic concurrency via `version` |
| `ConnectorSecretReference` | mutable root (internal-only) | `connector_secret_reference` | opaque `secretRef` + version + validation posture; **never a value** |
| `ConnectorOAuthGrant` | mutable root (internal-only) | `connector_oauth_grant` | state token, scopes, redirect; token stored by reference |
| `ConnectorHealthSnapshot` | append-only | `connector_health_snapshot` | one immutable probe result |
| `ConnectorEvent` | append-only, idempotent | `connector_event` | canonical translated event; `unique(idempotency_key)` |
| `ConnectorWebhookReceipt` | append-only, idempotent | `connector_webhook_receipt` | one delivery; `unique(idempotency_key)` |
| `ConnectorPollingCursor` | append-only, idempotent | `connector_polling_cursor` | one poll turn; cursor advance |
| `ConnectorAuditEvent` | append-only | `connector_audit_event` | lifecycle audit trail |

The **connector catalogue itself is not a table** — `ConnectorDescriptor`s live in
code (`CONNECTOR_REGISTRY`), like the AI-Foundation `MODEL_REGISTRY`. This keeps the
marketplace deterministic and additive: new connectors append; existing ids are
stable; there is no schema to migrate when a connector is added.

## Descriptors (registry)

- `ConnectorDescriptor` — `{ id, name, category, summary, vendor, authMethod,
  triggerKinds[], capabilities[], configFields[], scopes[], version, available,
  docsUrl }`.
- `ConnectorCapabilityDescriptor` — `{ key, label, description, sideEffect
  (read|write|external), operation }`.
- `ConfigFieldDescriptor` — `{ key, label, type (string|number|boolean|secret|
  enum|url), required, secret, helpText, options[] }`.

## State machines (in the domain, not `machines.ts`)

`INSTALLATION_TRANSITIONS` (guarded by `canTransitionInstallation`):

```
pending_configuration → configuring → validating → connected ⇄ degraded
   any live → disabled → validating (re-enable)
   validating/connected/degraded → error → configuring/validating
   any → revoked (terminal)
```

`OAUTH_GRANT_TRANSITIONS`: `pending → authorized → exchanged` (+ `failed`,
`expired`; exchanged/failed/expired terminal).

## Pure modules

- `registry.ts` — catalogue + lookups (`findConnector`, `isAvailableConnector`,
  `listConnectors`, `connectorSupportsTrigger`).
- `config.ts` — `validateConnectorConfig` (type-checks, splits secret vs non-secret,
  drops unknown keys, honours already-provisioned secrets on reconfigure),
  `isConfigComplete`, `resolveEnabledCapabilities`.
- `oauth.ts` — `buildOAuthState`, `verifyOAuthState`, `normalizeScopes`,
  `isTokenExpired`, `scopesSatisfied` (no crypto — PKCE/HMAC live in adapters).
- `idempotency.ts` — `installKey`, `connectorWebhookKey`, `pollKey`, `eventKey`,
  `oauthKey` (deterministic joins of natural identity).
- `health.ts` — `statusFromHealth`, `healthFromFailure`.
- `failures.ts` — `normalizeConnectorFailure` (safe message + retry disposition).
- `redaction.ts` — `sanitizeConnectorMetadata`, `hasNoConnectorSecrets`,
  `isSecretKey` (secret-key stripping for any jsonb/payload).
- `translation.ts` — `normalizeTranslatedEvents` (validate → sanitize → dedupe by
  `(externalId, type)` → cap at `MAX_EVENTS_PER_TURN`).
- `builders.ts` — immutable factories for every entity.
- `adapter-port.ts` / `repository.ts` — the outbound + persistence PORTS.
