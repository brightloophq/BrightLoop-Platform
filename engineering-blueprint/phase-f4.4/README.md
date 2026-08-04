# Phase F · Sprint F4.4 — Commerce Connectors

The **second and third production connector families** on the F4.1 Integration
Platform: **Shopify**, **Stripe**, and **PayPal**. Built as a **pure additive
connector family** — no change to the F4.1 framework, the F4.2/F4.3 execution model,
the database, RLS, capabilities, roles, or DTOs. Commerce connectors feel native
because they reuse every existing abstraction.

Branched off `origin/main` (which contains F4.1 `#67` + F4.2 `#68`). F4.3
Communication (`#69`) was still open at branch time; F4.4 is an independent sibling
family with **no code dependency** on F4.3, so it branches cleanly from `main`.

---

## 1. Architecture summary

```
Marketplace / Copilot / Runtime
        │  (unchanged application use-cases: install · configure · validate ·
        │   health · invoke · webhook-ingest · poll)
        ▼
@brightloop/application/integration  ── generic, provider-agnostic
        │  ConnectorAdapter port (F4.1) + execute() (F4.2)
        ▼
@brightloop/data/integration/commerce ── ONE generic engine + 3 bindings
   client.ts (callCommerce, authorize)   errors.ts   webhook.ts (HMAC)
   normalize.ts (canonical events)       helpers.ts  transport.ts (fetch seam)
   shopify.ts   stripe.ts   paypal.ts    adapter.ts (assembly)
        ▼
   Shopify Admin API · Stripe API · PayPal v1/v2  (only through the transport seam)
```

The commerce family follows the **F4.3 "binding" pattern**: one generic engine
(`callCommerce` + `CommerceProviderBinding`) drives all three providers, generalized
for commerce heterogeneity — **custom auth headers** (Shopify `X-Shopify-Access-Token`),
**per-provider base URLs** (Shopify shop domain, PayPal sandbox/live host),
**form vs JSON bodies** (Stripe form-encoded), **PayPal client-credentials token
minting** inside `authorize`, and **webhook HMAC verification**. A binding is the
ONLY provider-specific surface; no Shopify/Stripe/PayPal shape or secret leaves the
adapter layer.

## 2. Commerce connectors implemented

| Connector | id | Auth | Triggers | Capabilities |
|---|---|---|---|---|
| Shopify | `shopify` | api_key (Admin API token) | webhook + polling | 16 |
| Stripe | `stripe` | api_key (secret key) | webhook + polling | 15 |
| PayPal | `paypal` | api_key (client-credentials) | webhook | 9 |

All `available: true`, `category: commerce`.

## 3. Authentication strategy

*"Reuse existing connector authentication. OAuth where applicable, API Key where
required."* All three are **api-key style** from Auxion's perspective — no
user-redirect (Authorization-Code) OAuth is needed:

- **Shopify** — a custom-app **Admin API access token** attached via the
  `X-Shopify-Access-Token` header; the shop domain is non-secret config.
- **Stripe** — a **secret key** attached via `Authorization: Bearer`.
- **PayPal** — **OAuth2 client-credentials**: `authorize` exchanges
  `(clientId, clientSecret)` for a short-lived bearer token via `/v1/oauth2/token`
  (Basic auth) before every operation. `clientId`/`environment` are config; the
  client secret is the stored credential.

Token **validation / reconnect / expiry / rotation** reuse F4.1/F4.2 unchanged:
`validateConnection` probes the provider; a PayPal token is minted fresh per call;
the framework's `resolveConnectorSecret` still transparently refreshes+rotates
oauth2 bundles for any future OAuth commerce connector. User-redirect OAuth (Shopify
partner apps / Stripe Connect) is **additive later** — the platform already proves
oauth2 via Google/Slack/Teams; it needs no framework change.

## 4. Capability matrix (NORMALIZED — `commerce.*`)

Every provider exposes a **subset** of the shared `commerce.*` vocabulary; the
`operation` name is identical across providers (the adapter maps it onto its own
API). No provider-specific capability is ever exposed.

| Normalized capability | Shopify | Stripe | PayPal |
|---|:--:|:--:|:--:|
| commerce.store.read (store/account/merchant info) | ✅ | ✅ | ✅ |
| commerce.products.read / .write | ✅ | ✅ | — |
| commerce.collections.read | ✅ | — | — |
| commerce.inventory.read | ✅ | — | — |
| commerce.locations.read | ✅ | — | — |
| commerce.customers.read | ✅ | ✅ | — |
| commerce.orders.read / .write | ✅ | — | ✅ |
| commerce.draft_orders.write | ✅ | — | — |
| commerce.fulfillments.write | ✅ | — | — |
| commerce.price_rules.read | ✅ | — | — |
| commerce.discounts.read | ✅ | — | — |
| commerce.checkout.create | ✅ | ✅ | — |
| commerce.prices.read | — | ✅ | — |
| commerce.payments.read | — | ✅ | ✅ |
| commerce.payments.authorize | — | — | ✅ |
| commerce.payments.capture | — | ✅ | ✅ |
| commerce.payments.refund | ✅ | ✅ | ✅ |
| commerce.invoices.read | — | ✅ | — |
| commerce.subscriptions.read | — | ✅ | — |
| commerce.disputes.read | — | ✅ | — |
| commerce.balance.read | — | ✅ | — |
| commerce.events.read | — | ✅ | — |
| commerce.transactions.read | — | — | ✅ |
| commerce.health | ✅ | ✅ | ✅ |

Side effects: reads = `read`; provider-mutating writes (create order/checkout/
refund/capture/fulfillment) = `external`; local writes = `write`.

## 5. Event translation model

Provider events are normalized into the canonical `commerce.*` vocabulary inside the
adapters; provider event shapes never leak (`normalize.ts` + per-binding translators).

| Provider event | → Canonical |
|---|---|
| Shopify `orders/paid` (financial_status) | `commerce.order.paid` |
| Shopify `orders/fulfilled` | `commerce.order.fulfilled` |
| Shopify `orders/cancelled` (cancelled_at) | `commerce.order.cancelled` |
| Stripe `payment_intent.succeeded` | `commerce.payment.completed` |
| Stripe `charge.refunded` / `refund.created` | `commerce.payment.refunded` |
| Stripe `checkout.session.completed` | `commerce.checkout.completed` |
| Stripe `charge.dispute.created` | `commerce.dispute.created` |
| PayPal `PAYMENT.CAPTURE.COMPLETED` | `commerce.payment.completed` |
| PayPal `PAYMENT.CAPTURE.REFUNDED` | `commerce.payment.refunded` |
| PayPal `CHECKOUT.ORDER.COMPLETED` | `commerce.order.paid` |

Webhook signatures: **Shopify** = base64 HMAC-SHA256 of the raw body; **Stripe** =
the `t=…,v1=…` scheme (hex HMAC-SHA256 of `${t}.${rawBody}`), constant-time compared.
**PayPal** verification is **structural** (PayPal's cryptographic verification is an
online API call the synchronous webhook port cannot make — see limitations). All
verify → translate → persist runs through the F4.1 `ingestConnectorWebhook`
use-case, which is idempotent (replay = duplicate, no new event).

## 6. Health model

Reuses the F4.1 health enum + F4.2 seven-state reason detail:
`connected/healthy · disconnected · expired · permission_missing · rate_limited ·
configuration_error`, plus `disabled/revoked` via installation status. The pure
`classifyHttpStatus` → `reasonForCategory` → `healthForReason` chain maps provider
HTTP status onto the framework health level. PayPal health is proven by a successful
client-credentials token exchange (no separate probe).

## 7. Authorization model

**Unchanged.** Commerce reuses the F4.1 `integration.*` namespace + F4.2
`integration.invoke`. Admin `integration.*`; team_member read/install/configure/
enable/disable/health.check/oauth.authorize/ingest/**invoke**; clients
`integration.read` only. Every use-case load-and-authorizes against the LOADED
installation's `clientId`; RLS (internal-only tables) remains the final boundary.
No new capability, no authorization bypass.

## 8. Database changes

**None.** No new tables, columns, enums, RLS policies, triggers, or generated types.
The `invoke`, `webhook_ingest`, and `poll` audit operations already exist (F4.1) and
the audit CHECK already includes `invoke` (F4.2 migration `20260807000100`). No
pgTAP change (the spec requires pgTAP *only if* the schema changes — it did not).

## 9. Tests added

- **data** `commerce.test.ts` (+35): error classification (7 states), per-provider
  authorization (Shopify header / Stripe bearer / PayPal token exchange, live host),
  health probing, capability coverage (every declared op has a handler),
  operation→endpoint mapping + output normalization, **webhook HMAC verification with
  real crypto vectors** (accept + tamper-reject for Shopify & Stripe, structural for
  PayPal), event translation + polling cursors, secret non-leak, transport failures.
- **application** `integration-commerce.test.ts` (+9): marketplace presence +
  normalized capability subsets, api_key invocation + audit, **full webhook pipeline
  (verify → translate → persist → REPLAY duplicate → signature-reject)**,
  authorization (clients cannot invoke), secret non-leak.
- **domain** `integration.test.ts` (+1): commerce registry — normalized operations,
  provider subsets, side effects.

All external providers use **deterministic fake transports** — **zero live
Shopify/Stripe/PayPal calls** in CI.

## 10. Known limitations

- **PayPal webhook signature verification is structural**, not cryptographic:
  PayPal's real verification is an online `verify-webhook-signature` API call, which
  the synchronous `verifyWebhook` port (rawBody + one signature + signingSecret)
  cannot perform without redesigning the F4.1 port. Verification requires a
  configured webhook id and a present transmission signature; event translation is
  fully functional.
- **Shopify webhook topic is inferred from the body shape** (financial/fulfillment
  status, `cancelled_at`, `line_items`), because the `X-Shopify-Topic` header is not
  available through the synchronous webhook port. Stripe and PayPal events are
  self-describing and mapped precisely.
- **Polling is advertised** for Shopify/Stripe (`triggerKinds`) and implemented at
  the adapter layer, but an installation's active trigger is the first declared kind
  (`webhook`); switching an installation to polling is a configure-time enhancement.
- Binary/stream payloads (e.g. Shopify product images) are metadata-only, consistent
  with F4.2.
- User-redirect OAuth (Shopify partner apps, Stripe Connect) is deferred; the
  api-key path is production-real and the platform already supports oauth2 additively.

## 11. Files

**New** (`packages/data/src/integration/commerce/`): `transport.ts`, `errors.ts`,
`helpers.ts`, `normalize.ts`, `webhook.ts`, `client.ts`, `shopify.ts`, `stripe.ts`,
`paypal.ts`, `adapter.ts`, `commerce.test.ts`; and
`packages/application/src/integration/integration-commerce.test.ts`.

**Modified**: `packages/domain/src/integration/registry.ts` (+3 descriptors),
`packages/domain/src/integration/integration.test.ts` (+1 test),
`packages/data/src/index.ts` (barrel exports),
`apps/web/src/lib/repositories.ts` (adapter registry wiring).

**Adding a real connector later** stays a three-touch change: implement a binding in
`@brightloop/data`, register it in `createCommerceConnectorAdapters`, append a
`CONNECTOR_REGISTRY` descriptor — no framework change.
