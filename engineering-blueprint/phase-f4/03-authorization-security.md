# F4.1 · Authorization, tenancy & security

## Capability namespace (`integration.*`)

Added to `packages/schema/src/roles.ts` `PERMISSIONS`:

| Capability | owner/admin | team_member | client_admin / client_member |
|---|:--:|:--:|:--:|
| `integration.read` | ✓ (`integration.*`) | ✓ | ✓ |
| `integration.install` | ✓ | ✓ | — |
| `integration.configure` | ✓ | ✓ | — |
| `integration.enable` / `integration.disable` | ✓ | ✓ | — |
| `integration.health.check` | ✓ | ✓ | — |
| `integration.oauth.authorize` | ✓ | ✓ | — |
| `integration.ingest` | ✓ | ✓ | — |
| `integration.revoke` | ✓ | — | — |
| `integration.credentials.manage` | ✓ | — | — |

Revocation and credential/secret administration are owner/admin only (mirrors F3,
where rollback + credential management stay internal-admin authorities). Clients get
**read-only** visibility of their org's connectors and never touch credentials.

## Three-layer enforcement

1. **UI** — nav + controls are capability-gated (`may`).
2. **Application** — every use-case runs `authorize(actor, cap, targetClientId)` (the
   C1 funnel): capability via the domain matrix + ownership against the **loaded
   row's** `clientId` (load first, authorize on the row — never on the request).
3. **RLS** — the final boundary (below).

## RLS (migration `20260806000100`)

- **Installations, events, health, receipts, cursors, audit:** client reads own org
  (`bl_is_internal() OR client_id = bl_client_id()`); **internal writes only**.
- **Secret references + OAuth grants:** **INTERNAL-ONLY** for read *and* write —
  clients never see credential/token metadata.
- Append-only tables carry no `update`/`delete` grant and the shared
  `bl_txexec_append_only()` trigger.

## Secret handling

- No raw secret is ever stored, logged, returned, or placed in a DTO. Config secret
  fields are split out at install/configure and written straight to
  `ConnectorSecretStore`; the row holds only an opaque `secretRef` + version +
  validation posture.
- OAuth tokens are stored by reference (purpose `oauth_token`); the grant/installation
  link to the reference id, never the token.
- `sanitizeConnectorMetadata` strips secret-looking keys (`token`, `apiKey`,
  `password`, `authorization`, …) from every persisted jsonb blob and event payload;
  `hasNoConnectorSecrets` is asserted in tests.
- DTO tests assert the serialized detail view contains no secret value, no
  `secretRef`, and no `idempotencyKey`.

## Prompt-injection / untrusted content

Provider webhook/poll bodies are untrusted **data**. They are verified (signature),
translated by the adapter, then sanitized + bounded + deduped by
`normalizeTranslatedEvents` before persistence. Website/provider text can never
override Auxion policy — it is never interpreted as instructions.

## Determinism / no ambient authority

The domain is Node-free: no `crypto`, no `URL`, no clock. State tokens, scopes and
expiry are pure; PKCE/HMAC signature crypto is an adapter concern (the Fake uses a
deterministic djb2 signature for reproducible tests; a real adapter uses a proper
cryptographic HMAC in its own transport module).
