# AUXION — Phase F · Sprint F4.2 · Google Workspace Connectors

> Engineering report. The **first production connectors** built on the F4.1
> Integration Platform: Gmail, Google Calendar, Google Drive, Google Contacts.
> The framework was treated as stable and **extended additively in exactly one
> place** (capability execution — see §1). No other connector is implemented; the
> DO-NOT-BUILD list (Slack/Teams/Discord/Shopify/Stripe/HubSpot/QuickBooks/Meta/
> LinkedIn) is untouched.

Branch: `feat/f4-google-workspace` (off `feat/f4-integration-core`, since F4.1 /
PR #67 is not yet merged — the mission's stated fallback). One PR, left **open**.

---

## 1. Architecture summary

F4.2 adds no new bounded context. It plugs four Google services into the F4.1
`integration` context by implementing the `ConnectorAdapter` port in
`@brightloop/data` and adding four descriptors to the pure `CONNECTOR_REGISTRY`.

**The one framework completion (additive, not a redesign).** F4.1 *declared*
connector capabilities (each `ConnectorCapabilityDescriptor` names an `operation`)
but shipped no way to *execute* one. Production connectors need that, so F4.2 adds:

- an optional `execute(input): ConnectorResult<OperationOutput>` method on
  `ConnectorAdapter` (same optional-method pattern as OAuth/webhook/poll);
- an `invokeConnectorCapability` application use-case;
- one widened audit-operation value (`invoke`).

Nothing else in the port, registry, lifecycle, secret model, RLS, or DTO boundary
changed. This is the minimal seam required to make F4.1's capability model real.

```
packages/domain/src/integration/
  adapter-port.ts     +ExecuteOperationInput/OperationOutput +execute?()  (additive)
  registry.ts         +4 Google descriptors (oauth2, available)
packages/schema/src/integration.ts   connectorOperationSchema +"invoke"
packages/data/src/integration/google/
  transport.ts        GoogleHttpTransport seam + FetchGoogleHttpTransport (only fetch)
  client.ts           GoogleAdapterConfig + callGoogle (auth) + callGoogleForm (token)
  errors.ts           status → normalized category + 7 health reasons (pure)
  oauth.ts            authorize URL + code exchange + refresh (Authorization Code)
  helpers.ts          input extraction + bounded/sanitized output + MIME
  gmail.ts calendar.ts drive.ts contacts.ts   per-service operation maps + poll
  adapter.ts          createGoogleConnectorAdapter (validate/health/discover/oauth/
                      poll/translate/execute) + createGoogleConnectorAdapters + config loader
packages/application/src/integration/
  invoke-usecases.ts  invokeConnectorCapability
  shared.ts           resolveConnectorSecret (OAuth token resolve + refresh + rotate)
  installation/ingestion use-cases now resolve OAuth access tokens
apps/web/src/app/workspace/integrations/
  oauth/callback/route.ts     provider redirect → completeConnectorOAuth
  actions.ts                  connectConnectorAction + invokeCapabilityAction
  [installationId]/ConnectorControls.tsx   Connect / Reconnect
supabase/migrations/20260807000100_phase_f4_google_workspace.sql   audit op +"invoke"
```

The provider REST calls all go through one narrow transport seam so every test runs
offline against a fake transport; the real fetch transport is used only at the
composition root and never in CI.

## 2. Connectors implemented

| Connector | id | category | trigger | scopes (summary) |
|---|---|---|---|---|
| Gmail | `google-gmail` | communication | polling | gmail.modify, gmail.send |
| Google Calendar | `google-calendar` | productivity | polling | calendar, calendar.events |
| Google Drive | `google-drive` | storage | polling | drive |
| Google Contacts | `google-contacts` | crm | — | contacts.readonly |

All four are `oauth2`, `available: true`, and appear in the existing Marketplace
with no UI change (the marketplace renders `CONNECTOR_REGISTRY`).

## 3. OAuth implementation

Production **Authorization Code** flow (`oauth.ts` + the F4.1 begin/complete
use-cases), reusing the F4.1 OAuth abstraction end to end:

- **Authorization URL** — `accounts.google.com/o/oauth2/v2/auth` with
  `access_type=offline` + `prompt=consent` (so a refresh token is issued),
  `include_granted_scopes`, CSRF `state` minted + verified by the framework.
- **Code exchange** — `oauth2.googleapis.com/token`; the token bundle
  (access + refresh + computed absolute expiry) goes straight to the
  `ConnectorSecretStore`.
- **Refresh + rotation + expiry** — `resolveConnectorSecret` reads the stored
  bundle, and when the reference is expired it refreshes via the adapter, ROTATES
  the stored secret (new version + new expiry), re-validates the reference, and
  returns the new access token — transparently, before validate / health / poll /
  invoke. Google's "no new refresh token on refresh" case is handled (the old one
  is retained).
- **Revocation** — F4.1 `revokeConnector` revokes every secret reference.
- **Connection validation** — a cheap per-service probe (`gmail…/profile`,
  `calendarList`, `drive/about`, `people…/connections`).
- **Reconnect** — the detail page shows **Connect** (first time) / **Reconnect**
  (re-auth); both call `beginConnectorOAuth`; the provider redirects to
  `/workspace/integrations/oauth/callback` → `completeConnectorOAuth`.

## 4. Capability matrix

| Connector | Capability key → operation | Side effect |
|---|---|---|
| Gmail | send · draft · read · search · labels · threads · attachments · reply · archive | send/reply **external**, draft/archive write, rest read |
| Calendar | calendars.list · events.list · events.create · events.update · events.delete · freebusy · events.invite | create/delete/invite **external**, update write, rest read |
| Drive | files.list · files.search · files.get · files.download · files.upload · folders.list · permissions.list | upload **external**, rest read |
| Contacts | list · search · get · organizations | all read |

A data-layer test asserts **every declared capability has an executable handler**
(no declared-but-unimplemented operation).

## 5. Health model (all seven states)

Derived purely from the provider probe (`errors.ts` + the adapter):

| Required state | Representation |
|---|---|
| Healthy / Connected | health `healthy`, reason `connected`, status → `connected` |
| Disconnected | health `unavailable`, reason `disconnected` (5xx / network) |
| Expired | health `unauthorized`, reason `expired` (401) |
| Permission Missing | health `unauthorized`, reason `permission_missing` (403 non-quota) |
| Rate Limited | health `degraded`, reason `rate_limited` (429 / 403 quota) |
| Configuration Error | health `degraded`, reason `configuration_error` (400) |

The reasons ride in the health-snapshot `detail`; no new health enum value was
needed (reuses F4.1's `ConnectorHealthLevel` + the append-only snapshot table).

## 6. Authorization model

Unchanged three layers; one capability added. `integration.invoke` is granted to
`owner`/`admin` (via `integration.*`) and `team_member`; **client roles cannot
invoke** (they keep read-only `integration.read`). Every invocation runs the F4.1
`authorize(actor, cap, loadedRow.clientId)` funnel, is gated on the installation
being operable + the capability enabled + declared, and RLS remains the final
tenant boundary. Every invocation writes an append-only `invoke` audit row.

## 7. Database changes

**One additive migration** (`20260807000100`): widen the `connector_audit_event`
operation CHECK to include `invoke`. **No new tables, columns, indexes, RLS
policies, or triggers** — the four connectors reuse the entire F4.1 schema
(installations, secret references, oauth grants, health/event/receipt/cursor/audit).
No generated-type change (operation is a `text` check, not a pg enum). pgTAP added:
`invoke` accepted, unknown operation still rejected.

## 8. Tests added

- **Data — `google/google.test.ts` (23):** error classification (7 states), OAuth
  (authorize URL / exchange / refresh / empty-input guards / client-secret only to
  token endpoint), validate + health + discover, **capability coverage** (every
  declared op has a handler), representative operations per service (right
  endpoint + normalized output), event translation (Gmail→`email.received`,
  Calendar→`calendar.event.changed` + syncToken), secret non-leak, missing-token
  short-circuit, transport network/timeout mapping.
- **Application — `integration-google.test.ts` (10):** marketplace availability +
  capability matrix; invoke success + audit; undeclared → NotFound; declared-not-
  enabled → Validation; non-operable → Conflict; client → Forbidden; **expiry →
  refresh → rotation**; unresolvable token → reconnect; operation-result non-leak.
- **Domain — `integration.test.ts` (+2):** the four Google descriptors registered
  (available, oauth2, scoped) + side-effect classes.
- **pgTAP — `phase_f4_google_workspace_test.sql`:** the audit-operation change.

Totals now: **domain 985 · application 275 · data 74** workspace tests, all green.

## 9–12. Typecheck · Lint · Test · Build

`pnpm turbo run typecheck lint test build` → **36 / 36 tasks green** (0 cached on
the final run). Live Google API calls: **0** — all tests use the fake transport;
the real transport is constructed only at the composition root.

## 13. Commit hashes

Filled in on the PR (this doc is committed with the code). The feature commit is
`feat(integration): add Google Workspace connectors (F4.2)`; a follow-up
`chore(db)` regenerates types only if CI reports drift (none expected — no enum/
table change).

## 14. PR number

Opened against `main` as **one** PR (number recorded on creation). Left **open**.

## 15. Mergeability

Targets `main` but **depends on F4.1 (PR #67)** — it branches off
`feat/f4-integration-core`. It should merge **after** F4.1, or F4.1+F4.2 merge
together. Cleanly rebases; no conflicts with `main` beyond the F4.1 delta.

## 16. Known limitations

- **Binary payloads are metadata-only.** Drive `download`/`upload` and Gmail
  `attachments` return file/attachment **metadata**, not bytes — streaming binary
  through a JSON operation result is out of scope; the endpoints/refs are surfaced
  for a follow-up streaming path.
- **Polling, not push.** Events use cursor-based polling (Gmail message list,
  Calendar syncToken, Drive change feed). Gmail Pub/Sub push + Drive/Calendar
  webhooks are a later enhancement (the framework's webhook seam already exists).
- **Live smoke test is manual.** There is no gated live test that spends Google
  quota; the fake-transport suite is exhaustive but a real end-to-end OAuth run
  requires configured `GOOGLE_OAUTH_*` env + a Google project.
- **Client id/secret via env.** App-level OAuth creds come from
  `GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI` (provisioned out-of-band); with
  them unset the connectors still install but OAuth fails clearly.

## 17. Status

**READY FOR REVIEW.** Framework treated as stable (one additive completion,
documented); four production connectors implemented; OAuth + secret rotation +
7-state health + normalized events + full authorization; additive DB change only;
fully tested; gate green. Left open, not merged, pending F4.1.
