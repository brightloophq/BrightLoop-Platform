# Phase F · Sprint F4.6 — Finance Connectors

The **Finance production connector family** on the F4.1 Integration Platform:
**QuickBooks Online** and **Xero**. Built as a **pure additive connector family** —
no change to the F4.1 framework, the F4.2/F4.3/F4.4/F4.5 execution model, the
database, RLS, capabilities, roles, or DTOs. Finance connectors feel native because
they reuse every existing abstraction.

Branched off `main` **after** merging the F4.5 CRM prerequisite (`#71`). The one
additive schema touch: `connectorCategorySchema` gained a new `"finance"` member. That
enum is **not persisted in the database** (connector `category` lives only in the
in-memory registry + Zod), so there is **no migration, pgTAP, RLS, or generated-type
impact**. QuickBooks/Xero are accounting software, not `payments` processors, so a
distinct marketplace category is the correct model.

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
@brightloop/data/integration/finance ── ONE generic engine + 2 bindings
   client.ts (callFinance, authorize, callTokenEndpoint)   errors.ts
   oauth.ts (generic auth-code, Basic client-auth)   normalize.ts   contracts.ts
   helpers.ts   quickbooks-query.ts (allowlisted query builder)   webhook.ts (HMAC)
   quickbooks.ts   xero.ts   adapter.ts (assembly)
        ▼
   QuickBooks v3 Accounting API · Xero Accounting API  (only via the transport seam)
```

The finance family blends the F4.5 CRM binding pattern with the Salesforce
`instance-URL-as-config` tenancy model: one generic engine (`callFinance` +
`FinanceProviderBinding`) drives both providers over OAuth 2.0 authorization-code
auth, with **per-install tenancy** (QuickBooks `realmId` + environment in the API
path, Xero `tenantId` as the `Xero-Tenant-Id` header), **HTTP Basic client-auth** at
both token endpoints, and **HMAC-SHA256 (base64) webhook verification**. A binding is
the ONLY provider-specific surface; no QuickBooks/Xero shape or secret leaves the
adapter layer.

## 2. Finance connectors implemented

| Connector | id | Auth | Triggers | Capabilities |
|---|---|---|---|---|
| QuickBooks Online | `quickbooks` | OAuth 2.0 | webhook, polling | 21 (`finance.*` incl. payment refund) |
| Xero | `xero` | OAuth 2.0 | webhook, polling | 20 (`finance.*`) |

Both declare a SUBSET of one **normalized `finance.*` vocabulary**; the `operation`
name is identical across providers, so the Runtime / Copilot / Audit see one
provider-neutral model.

## 3. Normalized capability vocabulary

```
finance.company.read
finance.accounts.list
finance.customers.list · read · create
finance.invoices.list · read · create · update
finance.payments.list · read · create · refund†
finance.expenses.list · read · create
finance.items.list · read · create
finance.taxes.list
finance.health
```

† `payments.refund` — QuickBooks only (RefundReceipt). Xero models refunds through
credit notes / overpayments (a distinct object) and omits it — the same
normalized-subset asymmetry as F4.5 (Salesforce leads / HubSpot archive). Each
provider maps its subset onto its own API; unsupported operations are simply not
declared.

## 4. Authentication

Both use **OAuth 2.0 authorization-code** via the F4.1 OAuth abstraction and the
generic `oauth.ts` (authorize URL → code exchange → refresh). Access + refresh tokens
are stored ONLY by reference in the `ConnectorSecretStore`; `resolveConnectorSecret`
(F4.2) transparently refreshes + rotates an expired token before every invocation.
App-level client credentials come from the environment
(`QUICKBOOKS_/XERO_CLIENT_ID|SECRET`) and are never persisted. Both token endpoints
require **HTTP Basic client-auth** (`tokenAuthStyle: "basic"`) — the client secret is
sent only in the `Authorization` header, never in the request body.

- **QuickBooks Online** — Intuit `oauth.platform.intuit.com`; **`realmId` + environment
  (production/sandbox) carried as install config** because the framework exchange runs
  with empty config, so the company API base (`${host}/v3/company/{realmId}`) cannot be
  taken from the token response. Refresh rotation.
- **Xero** — `identity.xero.com` for OAuth; **`tenantId` carried as install config** and
  attached as the `Xero-Tenant-Id` header on every call (the multi-tenant analogue of
  Salesforce's instance URL). Refresh rotation.

## 5. QuickBooks safe query construction

`quickbooks-query.ts` is the **only** place a QuickBooks query string is produced. Raw
QBO query text is never accepted from a user, the Copilot, or any capability input.
QuickBooks has no first-class REST list endpoint — every list/read goes through this
builder. Each query is built from a typed `QboQuerySpec` whose entity is validated
against a curated allowlist (`CompanyInfo`, `Account`, `Customer`, `Invoice`,
`Payment`, `Purchase`, `Item`, `TaxCode`, `TaxRate`); string literals are escaped,
filter identifiers constrained to `[A-Za-z0-9_.]`, and `MAXRESULTS` clamped to ≤ 1000.
Unknown entities are rejected — no arbitrary entity traversal, no injection. Xero uses
fixed REST endpoints with a constant, safe `order`, so it needs no query builder.

## 6. Event translation

| Provider | Source shape | Canonical |
|---|---|---|
| QuickBooks | `eventNotifications[].dataChangeEvent.entities[]` (`Invoice`/`Payment`/`Customer`/… + operation) | `finance.invoice.updated` / `.voided`, `finance.payment.created`, … |
| Xero | `events[]` (`eventCategory` + `eventType`) | `finance.invoice.created` / `.updated`, `finance.customer.updated`, … |

Canonical vocabulary: `finance.invoice.created/updated/paid/voided`,
`finance.payment.created/updated`, `finance.customer.created/updated`,
`finance.expense.created`, `finance.item.updated`, `finance.event.received`.

## 7. Webhooks & polling

- **QuickBooks** — webhook (`intuit-signature`: base64 HMAC-SHA256 of the raw body with
  the Intuit verifier token, constant-time) + polling. Verify → translate → idempotent
  persist via F4.1 `ingestConnectorWebhook` (replay = duplicate). Polling reads recently
  modified invoices through the allowlisted query builder; cursor = next start position.
- **Xero** — webhook (`x-xero-signature`: base64 HMAC-SHA256 of the raw body with the
  webhook signing key) + polling. Polling reads `/Invoices?order=UpdatedDateUTC DESC`;
  cursor = next page. Xero emits only INVOICE + CONTACT webhook categories; PAYMENT
  changes surface through polling.

## 8. Database, RLS, generated types

**No database change.** Reuses the F4.1 `connector_*` tables, the `invoke` audit
operation, `integration.invoke`, and RLS as the final tenant boundary. No migration,
no pgTAP, no generated-type regeneration. The only schema-package edit is the additive
`"finance"` category on the Zod `connectorCategorySchema` (not a persisted column).

## 9. Marketplace & Copilot

Registry-driven — both finance connectors appear in the existing Integration
Marketplace with no web change (install / connect / reconnect / disconnect / health /
capabilities / audit reuse existing pages). The Copilot reaches finance only through
the existing capability path (intent → capability registry → authorization → invoke →
audit); provider-neutral commands like "show unpaid invoices" or "list recent payments"
resolve to normalized `finance.*` capabilities. It can never construct a raw QuickBooks
query or Xero filter.

## 10. Tests (all offline, deterministic)

- **Domain** +1 — Finance registry descriptors + normalized vocabulary + subset +
  `finance` category filter.
- **Data** +31 (`finance.test.ts`) — OAuth authorize/Basic-auth exchange/refresh
  rotation/expired, Bearer + tenancy resolution (QBO realmId path + sandbox host, Xero
  tenant header), 7-state error classification, operation→endpoint mapping +
  normalization, **QBO query allowlist + injection refusal**, webhook (real Intuit +
  Xero HMAC-SHA256 base64 vectors) + translation, polling cursor advance, rate-limit +
  transport-error mapping, secret non-leak.
- **Application** +11 (`integration-finance.test.ts`) — install + OAuth connect, read +
  write invocation, audit, client denial, missing-scope, refresh/rotation before invoke,
  revoked-token reconnect, idempotent webhook replay, polling replay-safety, secret
  non-leak.

**ZERO live QuickBooks/Xero calls** in CI — every test injects a fake transport.

## 11. Known limitations / deferred

- Xero omits `finance.payments.refund` (refunds are credit notes / overpayments — a
  distinct object model, not a refund of a payment record).
- QuickBooks/Xero API tenancy (`realmId` / `tenantId`) is install config, not persisted
  from the token response (the framework exchange runs with empty config).
- Xero webhooks cover only INVOICE + CONTACT categories; payment/expense changes are
  observed through polling.
- QuickBooks invoice status is derived (`Balance == 0 && Total > 0 → paid`); a partial
  or drafted state beyond open/paid/void is not modelled in the neutral contract.
- Xero expenses map to `BankTransactions` of `Type=="SPEND"`; bill (ACCPAY) workflows
  are deferred.
