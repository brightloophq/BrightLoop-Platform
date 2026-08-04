# Phase F · Sprint F4.5 — CRM Connectors

The **CRM production connector family** on the F4.1 Integration Platform:
**HubSpot**, **Salesforce**, and **Pipedrive**. Built as a **pure additive
connector family** — no change to the F4.1 framework, the F4.2/F4.3/F4.4 execution
model, the database, RLS, capabilities, roles, or DTOs. CRM connectors feel native
because they reuse every existing abstraction.

Branched off `main` **after** merging the two prerequisites (F4.3 Communication
`#69` + F4.4 Commerce `#70`), whose additive composition-root / registry /
`ENGINEERING_CONTEXT.md` conflicts were resolved during this sprint. `crm` was
already a `connectorCategory` in the F4.1 schema, so **no schema change** was needed.

---

## 1. Architecture summary

```
Marketplace / Copilot / Runtime
        │  (unchanged application use-cases: install · configure · validate ·
        │   health · invoke · webhook-ingest · poll · OAuth begin/complete)
        ▼
@brightloop/application/integration  ── generic, provider-agnostic
        │  ConnectorAdapter port (F4.1) + execute() (F4.2) + resolveConnectorSecret
        │  OAuth refresh/rotation (F4.2)
        ▼
@brightloop/data/integration/crm ── ONE generic engine + 3 bindings
   client.ts (callCrm, authorize, callTokenEndpoint)   errors.ts
   oauth.ts (generic auth-code)   normalize.ts   contracts.ts   helpers.ts
   salesforce-soql.ts (allowlisted query builder)   webhook.ts (HMAC/structural)
   hubspot.ts   salesforce.ts   pipedrive.ts   adapter.ts (assembly)
        ▼
   HubSpot CRM v3 · Salesforce REST/Query · Pipedrive v1  (only via the transport seam)
```

The CRM family blends the F4.3 OAuth binding pattern with the F4.4 commerce
`authorize → {baseUrl, headers}` + webhook pattern: one generic engine
(`callCrm` + `CrmProviderBinding`) drives all three providers over OAuth 2.0
authorization-code auth, with **per-provider base URLs** (HubSpot static host,
Salesforce instance URL, Pipedrive company domain), **body vs Basic client-auth** at
the token endpoint, and **webhook verification** (HubSpot HMAC, Pipedrive
structural). A binding is the ONLY provider-specific surface; no HubSpot/Salesforce/
Pipedrive shape or secret leaves the adapter layer.

## 2. CRM connectors implemented

| Connector | id | Auth | Triggers | Capabilities |
|---|---|---|---|---|
| HubSpot | `hubspot` | OAuth 2.0 | webhook, polling | 24 (`crm.*`) |
| Salesforce | `salesforce` | OAuth 2.0 | polling | 26 (`crm.*` incl. leads) |
| Pipedrive | `pipedrive` | OAuth 2.0 | webhook, polling | 23 (`crm.*`) |

All three declare a SUBSET of one **normalized `crm.*` vocabulary**; the `operation`
name is identical across providers, so the Runtime / Copilot / Audit see one
provider-neutral model.

## 3. Normalized capability vocabulary

```
crm.account.read
crm.contacts.list · read · search · create · update · archive†
crm.companies.list · read · search · create · update
crm.deals.list · read · search · create · update · stage.update
crm.leads.list · read‡
crm.pipelines.list · crm.pipeline.stages.list
crm.activities.list · crm.activity.create · crm.notes.create
crm.owners.list
crm.health
```

† `contacts.archive` — HubSpot only (soft archive). ‡ `crm.leads.*` — Salesforce
only (HubSpot/Pipedrive have no first-class Lead object). Each provider maps its
subset onto its own API; unsupported operations are simply not declared.

## 4. Authentication

All three use **OAuth 2.0 authorization-code** via the F4.1 OAuth abstraction and
the generic `oauth.ts` (authorize URL → code exchange → refresh). Access + refresh
tokens are stored ONLY by reference in the `ConnectorSecretStore`; `resolveConnectorSecret`
(F4.2) transparently refreshes + rotates an expired token before every invocation.
App-level client credentials come from the environment
(`HUBSPOT_/SALESFORCE_/PIPEDRIVE_CLIENT_ID|SECRET`) and are never persisted.

- **HubSpot** — `api.hubapi.com`; tokens expire (~30 min) → refresh rotation. Token
  endpoint uses body client-auth.
- **Salesforce** — `login.salesforce.com` for OAuth; **instance URL (My Domain)
  carried as install config** because the framework exchange runs with empty config,
  so the API base URL cannot be taken from the token response. Refresh rotation.
- **Pipedrive** — `oauth.pipedrive.com`; token endpoint requires **HTTP Basic
  client-auth** (`tokenAuthStyle: "basic"`); company domain carried as install config.

## 5. Salesforce safe query construction

`salesforce-soql.ts` is the **only** place SOQL is produced. Raw SOQL is never
accepted from a user, the Copilot, or any capability input. Every read is built from
a typed `SoqlSpec` whose object and every field are validated against a curated
allowlist (`Contact`, `Account`, `Lead`, `Opportunity`, `OpportunityStage`, `User`,
`Task`, `Organization`); string literals are escaped, identifiers constrained to
`[A-Za-z0-9_]`, and `LIMIT` clamped to ≤ 200. Unknown objects/fields are rejected —
no arbitrary object traversal, no injection.

## 6. Event translation

| Provider | Source shape | Canonical |
|---|---|---|
| HubSpot | `subscriptionType` (`contact.creation`, `deal.propertyChange`, …) | `crm.contact.created`, `crm.deal.stage_changed`, … |
| Salesforce | polled opportunity deltas (`IsWon`/`IsClosed`) | `crm.deal.won` / `.lost` / `.updated` |
| Pipedrive | `meta.action` + `meta.object` + stage delta | `crm.deal.stage_changed` / `.won`, `crm.contact.created`, … |

Canonical vocabulary: `crm.contact.created/updated/archived`,
`crm.company.created/updated`, `crm.deal.created/updated/stage_changed/won/lost`,
`crm.activity.created`, `crm.note.created`, `crm.event.received`.

## 7. Webhooks & polling

- **HubSpot** — webhook (v1 body signature: hex SHA256 of `clientSecret+rawBody`,
  constant-time) + polling. Verify → translate → idempotent persist via F4.1
  `ingestConnectorWebhook` (replay = duplicate).
- **Pipedrive** — webhook (structural verification + optional shared-secret gate;
  Pipedrive offers no body HMAC) + polling.
- **Salesforce** — **polling only** (no first-class body-signed webhook); cursor
  persisted through the F4.1 polling model; replay-safe.

## 8. Database, RLS, generated types

**No database change.** Reuses the F4.1 `connector_*` tables, the `invoke` audit
operation, `integration.invoke`, and RLS as the final tenant boundary. No migration,
no pgTAP, no generated-type regeneration.

## 9. Marketplace & Copilot

Registry-driven — the three CRM connectors appear in the existing Integration
Marketplace with no web change (install / connect / reconnect / disconnect / health /
capabilities / audit reuse existing pages). The Copilot reaches CRM only through the
existing capability path (intent → capability registry → authorization → invoke →
audit); it can never construct raw HubSpot filters or Salesforce SOQL.

## 10. Tests (all offline, deterministic)

- **Domain** +1 — CRM registry descriptors + normalized vocabulary + subsets.
- **Data** +40 (`crm.test.ts`) — OAuth authorize/exchange/refresh/expired/revoked/
  missing-scope, Bearer + base-URL resolution, 7-state error classification,
  operation→endpoint mapping + normalization, **SOQL allowlist + injection refusal**,
  webhook (real HubSpot v1 HMAC vector) + translation + malformed body, polling,
  rate-limit + transport-error mapping, secret non-leak.
- **Application** +11 (`integration-crm.test.ts`) — install + OAuth connect, read +
  write invocation, audit, client denial, missing-scope, refresh/rotation before
  invoke, revoked-token reconnect, idempotent webhook replay, polling replay-safety,
  secret non-leak.

**ZERO live HubSpot/Salesforce/Pipedrive calls** in CI — every test injects a fake
transport.

## 11. Known limitations / deferred

- Salesforce is polling-only (Change Data Capture / streaming needs a persistent
  connection the synchronous webhook port cannot hold).
- HubSpot uses the v1 body signature (v3 signs method+uri+body+timestamp, which the
  sync webhook port does not carry).
- Pipedrive webhook verification is structural (no body HMAC offered by the provider).
- Salesforce/Pipedrive API base URLs are install config, not persisted from the token
  response (the framework exchange runs with empty config).
- `crm.account.update` and `crm.webhooks.manage` from the suggested vocabulary are
  intentionally omitted (no provider maps them safely without additional scopes).
