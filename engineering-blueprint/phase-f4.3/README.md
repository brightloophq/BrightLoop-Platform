# AUXION — Phase F · Sprint F4.3 · Communication Connectors

> Engineering report. Adds the **Communication connector family** — Slack, Microsoft
> Teams, Discord — on the completed Integration Platform (F4.1) using the production
> connector pattern established by F4.2. The framework was treated as **production-
> ready and unchanged**: F4.3 adds **zero** framework, schema, migration, or web
> changes — only registry descriptors + data-layer adapters + a composition-root
> merge + tests. The DO-NOT-IMPLEMENT list (Zoom/Telegram/WhatsApp/Signal/Email/
> Google/Commerce/CRM/Accounting) is untouched.

Base: `main` (F4.1 #67 + F4.2 #68 merged first, in that order). Branch:
`feat/f4-communication-connectors`. One PR, left **open**.

---

## 1. Architecture summary

Three communication connectors implemented as **data-driven bindings over one
generic engine**. No provider-specific business logic lives outside an adapter; the
three providers differ only by a `CommProviderBinding` (endpoints + auth style +
error classifier + a normalized-operation → API map + a poll translator). This is a
clean implementation of the platform, not three one-offs.

```
packages/domain/src/integration/registry.ts     +3 descriptors (normalized capabilities)
packages/data/src/integration/communication/
  transport.ts     CommHttpTransport seam + FetchCommTransport (ONLY place fetch runs)
  errors.ts        HTTP-status + Slack body-`ok` classifiers → category + 7 health reasons (pure)
  helpers.ts       input extraction + bounded/sanitized output
  client.ts        CommProviderBinding contract + callProvider (Bearer/Bot auth) + token endpoint
  oauth.ts         GENERIC Authorization-Code flow (authorize/exchange/refresh), endpoint-parameterized
  normalize.ts     canonical Auxion event vocabulary (communication.*)
  slack.ts teams.ts discord.ts   the three bindings (normalized op → provider API + poll translator)
  adapter.ts       createCommAdapter (generic) + createCommunicationConnectorAdapters + config loader
apps/web/src/lib/repositories.ts   getConnectorAdapterRegistry merges Fakes + Google + Communication
```

**No framework touch.** The F4.1 `ConnectorAdapter`/`ConnectorSecretStore`, F4.1
OAuth abstraction, F4.2 `execute()` seam + `invokeConnectorCapability` use-case +
`resolveConnectorSecret` (token refresh/rotation), the Marketplace, health snapshots,
authorization, and audit are all reused verbatim. All provider REST calls go through
one transport seam so every test runs offline.

## 2. Connectors implemented

| Connector | id | auth | trigger | notes |
|---|---|---|---|---|
| Slack | `slack` | OAuth2 | polling | workspace install, channels, chat, search, history |
| Microsoft Teams | `microsoft-teams` | OAuth2 (refresh) | polling | Graph: teams/channels/members/messages/replies/meeting |
| Discord | `discord` | **bot token** (api_key) | polling | guild discovery, channels/members, send/reply |

All three are `available: true` in the existing Marketplace (registry-driven, no UI
change). Slack + Teams use the OAuth **Connect / Reconnect** flow; Discord uses the
existing install form to collect its **bot token** as a secret config field.

## 3. OAuth implementation

Reuses the F4.1 OAuth abstraction + the F4.2 `resolveConnectorSecret` lifecycle
verbatim; F4.3 adds **one generic** Authorization-Code implementation parameterized
by a binding's endpoints:

- **Authorization URL / code exchange / refresh** for Slack + Teams
  (`login.microsoftonline.com` / `slack.com/oauth/v2`). Teams issues refresh tokens
  (`offline_access`) → **refresh + rotation + expiry** handled by the existing
  `resolveConnectorSecret` (transparently before validate/health/poll/invoke). Slack
  tokens are non-expiring by default (no refresh needed).
- **Reconnect / revocation / validation** are the existing framework flows.
- **Discord** uses **bot-token authentication** (no OAuth) — the api_key path;
  `Authorization: Bot <token>` is applied by the binding's `authStyle`.

Client id/secret are app-level env config (`SLACK_CLIENT_ID/SECRET`,
`MS_TEAMS_CLIENT_ID/SECRET`); Discord needs none. **No token or secret is ever
persisted outside the `ConnectorSecretStore`.**

## 4. Capability matrix (NORMALIZED)

All three expose the SAME `communication.*` capability keys + `operation` names; each
adapter maps the normalized operation onto its API. No provider API is exposed.

| Normalized capability | Slack | Teams | Discord |
|---|:--:|:--:|:--:|
| `communication.send_message` | ✓ | ✓ | ✓ |
| `communication.reply_message` | ✓ | ✓ | ✓ |
| `communication.edit_message` | ✓ | — | — |
| `communication.delete_message` | ✓ | — | — |
| `communication.list_channels` | ✓ | ✓ | ✓ |
| `communication.list_members` | ✓ | ✓ | ✓ |
| `communication.search_messages` | ✓ | — | — |
| `communication.read_history` | ✓ | ✓ | ✓ |
| `communication.list_containers` (workspace/team/guild) | ✓ | ✓ | ✓ |
| `communication.meeting_metadata` | — | ✓ | — |

A test asserts **every declared capability has an executable handler** and that all
providers share the normalized send/reply/list vocabulary.

## 5. Event translation model

Provider messages are translated into **canonical Auxion events** inside the
adapters and never leak outward (`normalize.ts` → `COMM_EVENTS`):

- Slack message → `communication.message.created` (threaded → `.replied`)
- Discord reply → `communication.message.replied`
- Teams channel message → `communication.message.created`

Poll turns produce these events; the F4.1 `normalizeTranslatedEvents` pipeline then
validates + sanitizes + dedupes + bounds them, and the F4.1 idempotent polling
persistence stores them replay-safe (same cursor → replay, no duplicate event).

## 6. Health model (all seven states)

Derived purely from the provider probe (`errors.ts` + the generic adapter), carried
in the health-snapshot `detail.reason` — **no new health enum**:

connected/healthy · disconnected (5xx/network) · expired (401 / Slack `invalid_auth`)
· permission_missing (403 / Slack `missing_scope`) · rate_limited (429 / Slack
`ratelimited`) · configuration_error (400). Slack's HTTP-200-with-`{ok:false}`
envelope is classified by `classifySlack`.

## 7. Authorization model

Unchanged. Invocation runs the existing `authorize(actor, integration.invoke,
loadedRow.clientId)` funnel, gated on operable + capability enabled + declared, and
audited (`invoke`). Clients hold read-only `integration.read` and **cannot invoke**
(tested). Workspace + tenant isolation + RLS are the F4.1 boundaries, unchanged.

## 8. Database changes

**None.** F4.3 introduces no table, column, enum, RLS policy, trigger, or capability.
It reuses the existing `connector_*` tables, the `invoke` audit operation (added in
F4.2), and `integration.invoke`. No generated-type change; no migration; no pgTAP
required.

## 9. Tests added

- **Data — `communication/communication.test.ts` (24):** error/health classification
  (7 states incl. Slack body-`ok`), OAuth (Slack URL / Teams exchange + refresh /
  Discord has NO oauth methods), validate + health per provider, **capability
  coverage** (every declared op has a handler + shared normalized vocabulary),
  normalized operations hit the right endpoint (Slack `chat.postMessage`, Teams Graph,
  Discord top-level array), event translation → canonical (Slack/Teams/Discord poll +
  no-channel no-op), secret non-leak, missing-token short-circuit, bot-auth header,
  transport failure mapping.
- **Application — `integration-communication.test.ts` (5):** marketplace availability
  + normalized capabilities + per-provider subsets; the **bot-token (api_key)
  invocation path** end-to-end (install → validate → invoke → audit); secret non-leak;
  client-cannot-invoke authorization.
- **Domain — `integration.test.ts` (+1):** the three descriptors registered
  (available, communication, normalized capability names, Discord api_key).

Totals now: **domain 986 · application 280 · data 98** workspace tests, all green.

## 10–13. Typecheck · Lint · Test · Build

`pnpm turbo run typecheck lint test build` → **36 / 36 tasks green**. Live
Slack/Teams/Discord API calls: **0** — all tests use the fake transport; the real
transport is constructed only at the composition root.

## 14. CI status

To be filled on the PR — the full gate (verify · db-verify · gitleaks · Vercel)
runs on the PR to `main`. db-verify is expected green with **zero type-drift** (no
schema change).

## 15. Commit hashes

The feature commit is `feat(integration): add Communication connectors (F4.3)`
(hash recorded on the PR). No `chore(db)` follow-up is expected (no schema change).

## 16. PR number

Opened against `main` as **one** PR (number recorded on creation). Left **open**.

## 17. Mergeability

Branches off the up-to-date `main` (with F4.1 + F4.2 merged); clean, no stacking. It
merges independently.

## 18. Known limitations

- **Polling, not push.** Events use cursor-based polling (Slack `conversations.history`,
  Teams channel messages, Discord channel messages). Slack Events API / Teams change
  notifications / Discord Gateway are a later enhancement (the framework's webhook
  seam already exists).
- **File/meeting payloads are metadata-only** (no binary attachment bytes).
- **Discord uses a bot token** (api_key), not user OAuth — matching the mission's
  "bot authentication".
- **Teams delete/edit** are not exposed (Graph channel-message edit/delete are
  restricted); Slack provides the full edit/delete set.
- **No gated live test** spends provider quota; the fake-transport suite is exhaustive.

## 19. Status

**READY FOR REVIEW.** Framework unchanged; three production connectors implemented as
clean platform bindings; normalized capabilities + canonical events; OAuth (Slack/
Teams) + bot auth (Discord); 7-state health; full authorization + audit; no DB change;
fully tested; gate green. Left open, not merged.
