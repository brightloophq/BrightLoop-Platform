# PX.1e — AI Experience Everywhere — Engineering Report

> **Sub-sprint:** PX.1e (PX.1 · Product Experience).
> **Branch:** `feat/px1e-ai-experience` (off `main` @ `58ad37d` — PX.1a–d present).
> **Status:** Implemented · full gate green · one PR (leave OPEN, do not merge).
> **Scope:** Surface AI on product pages **through the existing certified path**. No
> provider calls in UI, no second Copilot, no fabricated production AI. Reuses `may()`
> authorization, Demo Mode, and design tokens.

---

## 1. Mandatory audit (done first)

`engineering-blueprint/px-1/PX.1e-ai-experience-audit.md` maps the one certified flow
(**server action → `buildAppContext` → application use-case → capability gate → `may` →
dispatch → cited/audited result**) and a **Route-to-AI Capability Matrix**. Two findings
shaped the build: (1) the platform's AI is **deterministic** today (the Copilot never
calls a live provider; live Anthropic is behind kill-switches, scan-only), so
composed-from-read-model + cited answers are *real*, not fabricated; (2) most product
routes have read-models but **no wired AI capability** → **Future Phase** (honest
unavailable states, never fabrication). There is **no `billing` intent/capability** —
flagged future.

## 2. Deliverables

**Shared AI Action surface** — `packages/ui/src/ai/` (one component, no per-page widgets):
- `AiActionBar` — a row of contextual actions + inline result; owns only view state and
  runs an **injected** server action (the UI never calls a provider).
- `AiResultPanel` — consistent pattern for summary / explanation / risk / recommendation
  / comparison / forecast / action-plan, with the **evidence & trust** row (capability ·
  generated-at · confidence · advisory-vs-proposal), a clear **Demo** badge, copy/retry,
  a **gated executable** follow-up, and honest **denied / unavailable(+future-phase) /
  error** states. `aria-live`, keyboard, reduced-motion, token-only (Light/Dark/System).
- `state.ts` (pure — tone, confidence, retry/copy predicates; **5 tests**), `types.ts`
  (`AiActionOutcome`, `AiResult`, `AiActionDef`).

**Certified seam** — `apps/web/src/lib/ai/`:
- `matrix.ts` — pure route→action matrix (defs + `requiredPermission` +
  advisory/supported/future status + `routeHasLiveAi`; **4 tests**). Client never sees
  the server-only meta (`actionDefs` strips it).
- `demo-content.ts` — deterministic, evidence-shaped, `demo:true` outputs aligned with
  the PX.1b/c demo numbers. Server-only.
- `actions.ts` — the `"use server"` `runContextualAiAction(ctx, key)`: authorizes with
  `may(actor, permission)` (the same primitive the Copilot gate uses), returns a demo
  result in Demo Mode, an honest future-phase/denied state otherwise, and a Copilot
  handoff for advisory/supported actions in production. **No provider call.** Bound
  per-route via `runContextualAiAction.bind(null, { route })`.

**Wired routes:** Console (advisory — Summarize today / Explain business health / Top
risks / Recommend next actions) and Signals (demo-gated; future-phase in production, so
no dead buttons). The System Map already carries its PX.1d AI layer. Approvals is
matrix-ready; Insights/Recommendations/Clients/Invoices/Analytics are **Future Phase**.

## 3. Priorities coverage

Contextual AI actions ✓ · shared component (no per-page widgets) ✓ · routes through the
existing Copilot/capability path ✓ · evidence & trust (capability · confidence ·
generated-at · advisory/proposal · citations) ✓ · write-action safety (gated
`executable` → existing confirm/approval; AI never touches billing/permissions/secrets/
subscriptions/connector-creds/destructive records) ✓ · consistent result panels ✓ ·
Demo Mode deterministic + labeled, production honest ✓ · empty/unavailable states
(reason + future-phase, no dead buttons) ✓ · performance (no provider calls, no extra
round-trips beyond the action, memo-free pure logic) ✓ · accessibility (keyboard,
`aria-live`, focus, reduced-motion, non-color status) ✓ · theme (token-only) ✓.

## 4. Safety & integrity

- **No direct provider call in any UI component** — the action bar runs an injected
  server action; execution is server-side on the certified path.
- **No second Copilot** — authorization reuses `may()`; production advisory actions hand
  off to the existing Copilot; inline `generateCopilotResponse` execution is the
  documented next step.
- **Production never fabricates** — real (deterministic) Copilot for advisory/supported;
  honest future-phase for the rest. Demo outputs are always `demo:true`-labeled and
  gated off in production (`isDemoMode` → false when `VERCEL_ENV==="production"`).
- **Authorization + tenancy** unchanged; a role lacking the permission gets a denied
  state.

## 5. Gate & verification

`pnpm turbo run typecheck lint test build` → **36/36 green.** `@brightloop/ui` +5
(ai-state), web +4 (route matrix). **ZERO live provider calls** (deterministic + demo).
Authenticated visual review runs on this PR's Vercel preview with `AUXION_DEMO_MODE=true`
(routes are auth-gated; sandbox has no internal session).

## 6. Follow-ons (documented)

- Inline Copilot execution (`generateCopilotResponse`) for advisory routes (the panel
  already renders the DTO shape).
- New `CAPABILITY_REGISTRY` entries mapped to existing services for Signals / Analytics /
  Recommendations / Insights / Clients (no provider calls) → promote those routes from
  Future Phase.
- Approvals / Projects / Reporting wiring; live-provider enablement behind the existing
  `AUXION_LIVE_AI_ENABLED` + `AUXION_ANTHROPIC_ENABLED` kill-switches.

---

*One PR, targeting `main`, left OPEN. Not merged.*
