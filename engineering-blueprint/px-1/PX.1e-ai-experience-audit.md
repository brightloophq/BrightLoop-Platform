# PX.1e — AI Experience Audit & Route-to-AI Capability Matrix

> **Mandatory first deliverable** (produced before any code, per the sprint brief).
> Grounded in a full read of the existing AI architecture — no invented provider
> calls, no second Copilot. Goal: surface AI on product pages **through the
> certified path**, and honestly mark everything else **Future Phase**.

---

## 1. The one certified path (must be reused verbatim)

```
UI (client) → server action ("use server") → buildAppContext()
  → @brightloop/application use-case
  → detectIntent (pure) → capabilityGate(key) → may(actor, requiredPermission)
  → requiresApproval check → dispatch to an EXISTING application service
  → result composed into a CITED answer + persisted (message/citation/action) + audited
  → revalidatePath
```

- **Entry:** React **server actions** (the Copilot has **no** `/api` route). Reference:
  `apps/web/src/app/workspace/copilot/actions.ts` (`sendMessageAction` →
  `generateCopilotResponse`; `executeActionAction` → `executeCopilotAction`).
- **Context:** `apps/web/src/lib/runtime-api.ts` `buildAppContext()` (RLS-scoped repos +
  actor; `null` when unauthenticated).
- **Authorization:** `@brightloop/domain/capabilities.ts` — `may(actor, cap)` /
  `assertCapability`. Tenant: `assertOwnClient` / `assertCanActOnClient`.
- **Capability registry (single authority):** `@brightloop/domain/agents/capabilities.ts`
  `CAPABILITY_REGISTRY` — only keys here are dispatchable; each declares
  `requiredPermission`, `sideEffect`, `approval`, `audited`, `provider`, `rollback`.
- **Tool gateway (full audited seam, for agents):** `@brightloop/application/agents/gateway.ts`
  `invokeAgentCapability` (registry → allow-list → `may` → tenant → approval → budget →
  idempotency → `dispatchCapability` → audit).
- **Copilot invoker (narrower):** `@brightloop/application/copilot/copilot-usecases.ts`
  `invokeCopilotCapability` — gates `capabilityGate` + `may` + approval; **currently
  dispatches only** `reporting.generate_report` and `execution.get_workspace_state`.
- **AI execution is DETERMINISTIC today.** `createDeterministicAiProvider` is wired
  (`getAiProviderRegistry`); live Anthropic is behind `AUXION_LIVE_AI_ENABLED` +
  `AUXION_ANTHROPIC_ENABLED` and reachable only via `runControlledScanReasoning` (no
  route). The Copilot itself never calls a live provider. **This is good for PX.1e:**
  deterministic composed-from-read-model answers with citations are *real*, not
  fabricated, and are production-safe.

**DTOs to reuse** (`@brightloop/application/copilot/dto.ts`): `CopilotResponseDTO
{ message, citations[], actions[] }`; `CopilotActionDTO` carries `capabilityKey`,
`requiredPermission`, `requiresApproval`, `enabled` — the hooks for evidence + write
safety.

**Corrections to the brief's assumptions:** there is **no `billing` Copilot intent or
`billing.*` capability** in this tree; and `integration.invoke` is a separate app
permission (`INTEGRATION_INVOKE_CAP`), not an E7 registry key. Both → Future Phase.

---

## 2. Route-to-AI Capability Matrix

Legend — **Supported now** (a real capability/intent + read-model exists on the
certified path) · **Advisory now** (deterministic Copilot answer composed from the
route's real read-model + citations; no new capability) · **Future Phase** (read-model
exists but no wired AI capability — show an honest unavailable state, never fabricate).

| Route | Backing read-model / service | Proposed AI actions | Status | Powering capability / intent |
|---|---|---|---|---|
| **Console** `/admin/dashboard` | `TransformationDashboardReader` | Summarize today · Explain business health · Top risks · Next actions | **Advisory now** | `summary` intent + `execution.get_workspace_state` |
| **System Map** `/admin/system-map` | `getSystemMapData` (demo/live) | Explain node · Summarize dependencies · Systemic risk · Next best action | **Advisory now** (already has an AI layer, PX.1d) | per-node `ExplorerAi` (deterministic) |
| **Approvals** `/admin/approvals` | approvals read-model | Summarize request · Highlight risks · Recommend decision + rationale | **Advisory now** | `approval` intent (composed + cited); execution stays in the existing approval flow |
| **Projects** `/admin/projects` | project-manager read-models | Assess delivery risk · Summarize status · Blockers · Next milestone | **Supported now** | `planning.get_execution_plan` / `planning.generate_plan` (registry) |
| **Reporting** (workspace) | reporting read-models | Generate executive summary | **Supported now** | `reporting.generate_report` (registry, Copilot-dispatched) |
| **Signals** `/admin/signals` | `SignalsReadRepository` | Explain signal · Action plan · Estimate impact · Compare | **Future Phase** | no signal AI capability wired |
| **Insights** `/admin/insights` | core-surface | Explain · Evidence · Exec summary | **Future Phase** | ComingSoon module; no capability |
| **Recommendations** `/admin/recommendations` | recommendations read-model | Forecast impact · Trade-offs · Implementation plan | **Future Phase** | maps to `strategy.get_result` but not wired for this surface |
| **Clients** `/admin/clients` | clients read-model | Relationship summary · Churn risk · Engagement | **Future Phase** | no capability |
| **Invoices** `/admin/invoices` | invoices read-model | Explain balance · Payment risk · Draft follow-up | **Future Phase** | no billing capability/intent exists |
| **Analytics** `/admin/analytics` | analytics read-model | Explain trend · Anomaly · Period summary · Response | **Future Phase** | could reuse `reporting.*` later; not wired |

**Demo Mode** (`isDemoMode()`): every listed action renders a deterministic, clearly
**"Demo"**-labeled, evidence-shaped output (reusing the PX.1d/PX.1b/PX.1c demo pattern),
never calling a provider. **Production**: Supported/Advisory actions run the real
deterministic Copilot path (composed + cited); Future-Phase actions render an honest
"not available yet — here's why" state (no dead buttons, no fabrication).

---

## 3. What PX.1e builds (scoped to the certified surface)

1. **Shared AI Action surface** (`@brightloop/ui`): `AiAction` (button/menu) + `AiResultPanel`
   — one reusable component, all states (idle · loading · streaming-ready · success ·
   error · permission-denied · unavailable/future-phase · demo), evidence/citations,
   capability-used + generated-at + advisory-vs-executable, retry, copy/export. Pure
   state logic unit-tested. Token-only (Light/Dark/System), keyboard + aria +
   reduced-motion. **No per-page widgets.**
2. **Certified contextual-AI server action**: routes an action through the existing
   Copilot use-case path (`buildAppContext` → copilot use-case → `may` → dispatch →
   cited/audited `CopilotResponseDTO`). **No provider call in UI**, no second Copilot.
3. **Demo deterministic outputs** for Supported/Advisory actions + honest Future-Phase
   states for the rest.
4. **Write-action safety**: any executable result surfaces as a gated `CopilotActionDTO`
   (requiredPermission + requiresApproval) → preview → confirm → existing service; AI
   never mutates billing/permissions/secrets/subscriptions/connector-creds/destructive
   records outside the existing approval flow.
5. **Reference wiring**: Console (Advisory) + System Map (reuse existing AI layer via the
   shared component). Approvals/Projects/Reporting are matrix-ready; remaining routes
   ship the honest Future-Phase state.

**Follow-ons (enumerated):** full per-route wiring for Approvals/Projects/Reporting via
the certified path; new registry capabilities for Signals/Insights/Recommendations/
Clients/Invoices/Analytics (each = a registry entry mapped to an existing service, not a
provider call); live-provider enablement (behind the existing kill-switches).

---

*Implementation begins from this matrix; nothing outside the certified path is built.*
