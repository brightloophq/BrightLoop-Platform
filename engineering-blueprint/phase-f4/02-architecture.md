# F4.1 · Architecture & seams

## The two ports (the whole point of F4)

### `ConnectorAdapter` (outbound provider seam)

Generalizes the F3 `RuntimeAdapter` from one n8n runtime to an open set of
connectors. Provider-neutral in/out; opaque connector id; normalized
`ConnectorResult<T>` (`{ok:true,value}` | `{ok:false,category,code,message}`) — a
raw provider error never crosses upward.

```
interface ConnectorAdapter {
  connectorId
  validateConnection(input)          → ConnectionValidationResult
  healthCheck(input)                 → ConnectorHealthResult
  discoverCapabilities(input)        → ConnectorCapabilityResult[]
  buildAuthorizationUrl?(input)      → string            // oauth2
  exchangeAuthorizationCode?(input)  → OAuthTokenBundle  // oauth2
  refreshAccessToken?(input)         → OAuthTokenBundle   // oauth2
  verifyWebhook?(input)              → VerifiedWebhook    // webhook
  translateWebhook?(input)           → CanonicalConnectorEvent[]
  poll?(input)                       → PollResult          // polling
}
type ConnectorAdapterRegistry = Partial<Record<string, ConnectorAdapter>>
```

Optional methods are present only when the descriptor declares the matching auth
method / trigger kind; the use-cases check the descriptor before invoking them.
`ConnectorConnectionInput` carries the secret **already resolved** from the store —
present only for the call, never persisted.

### `ConnectorSecretStore` (secret seam)

Mirrors F3 `RuntimeSecretStore`: `putSecret / getSecret / rotateSecret /
revokeSecret / validateSecretReference`. The application only ever holds an opaque
`ref`; values are resolved at the adapter boundary and never enter a DTO, row, log,
or read model. Env-backed adapter: `createEnvConnectorSecretStore`
(`CONNECTOR_SECRET__<ref>`).

## Request flow

```
Browser (server component)  → integration-data.ts  → buildAppContext()
                            → @brightloop/application read model → repositories (RLS)

Browser (client component)  → "use server" action  → buildAppContext()
                            → @brightloop/application use-case
                               (authorize → load → guard → work → persist → audit → DTO)
                            → ConnectorAdapter (secret resolved at boundary)
                            → repositories (RLS) → revalidatePath
```

Routes/actions stay thin; all authorization, config validation, the secret
boundary, idempotency, tenancy, audit, and error taxonomy live in the use-cases.

## Composition root

`apps/web/src/lib/repositories.ts` adds three getters —
`getIntegrationRepositories` (RLS-scoped Supabase adapters),
`getConnectorAdapterRegistry` (`createDefaultConnectorAdapters` — the two Fakes),
`getConnectorSecretStore` (env-backed). `buildAppContext` wires them onto
`AppContext.{integration, connectorAdapters, connectorSecrets}` (all optional, so
no pre-F4 use-case is affected; F4 use-cases require them via `requireIntegration`
/ `requireConnectorAdapters` / `requireConnectorSecrets`).

## Idempotency & replay (structural, no dedupe table)

Every ingestion key is a pure function of natural identity:
`connectorWebhookKey(installationId, externalEventId)`,
`pollKey(installationId, fromCursor)`,
`eventKey(installationId, source, externalId, type)`. A crash-and-retry recomputes
the same key; the repository `findByIdempotencyKey` returns the existing row and no
duplicate event is written. Webhook receipts and events carry `unique(idempotency_key)`
so the DB is the final guarantee.
