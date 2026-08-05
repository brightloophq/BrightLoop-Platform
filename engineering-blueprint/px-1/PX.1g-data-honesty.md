# PX.1g — Production Data Honesty Report

**Verdict: SOUND.** Production does not fabricate data; Demo Mode is hard-off in
production; public reputation content flows from the real source; AI future-phase states
are honest. No change was required, and none was made that could weaken these guards.

## Demo Mode production guard — verified solid
`apps/web/src/lib/repositories.ts`:

- `isDemoMode()` — **first line** `if (process.env.VERCEL_ENV === "production") return
  false;` (`:234`), before any cookie or env var is consulted. A crafted `auxion_demo`
  cookie or `AUXION_DEMO_MODE` env cannot enable demo in production.
- `demoToggleAvailable()` (`:250-252`) — same `VERCEL_ENV !== "production"` gate; the
  toggle server action `app/_components/demo-actions.ts:14` early-returns in prod (no-op),
  and `DemoModeBanner.tsx:13` renders nothing in prod.
- The guard keys on `VERCEL_ENV`, a platform-injected value the client cannot set.

Defense in depth across read path, toggle action, and banner UI. **Not weakened by
PX.1g.**

## Public reputation content — real source, honest empties
All public surfaces read through the repository **port**, never a hardcoded array:
`testimonials/page.tsx:60-64`, `portfolio/page.tsx:38-53`, home `page.tsx:50-55`. Default
source is Supabase (`reputationSource()` `repositories.ts:218-220`; an unset/invalid env
resolves to `supabase`, explicitly "NOT a fallback"). Seeded sample testimonials exist
only at `packages/data/src/placeholder/reputation.dataset.ts` — served **only** under an
explicit `BRIGHTLOOP_DATA_SOURCE=placeholder`, flagged `IS_PLACEHOLDER`, `disclosed:
false`, "DO NOT SHIP", and surfaced behind a `PlaceholderNotice`. Real path shows honest
empty states ("No published reviews yet" / "No published projects yet") and emits no
aggregate rating for an empty set. **Consistent with the project's "real testimonials
pending CMS" position — no fake testimonials are presented as real.**

_Noted (OUT-OF-SCOPE, OOS-3):_ `testimonials/page.tsx:82-84` states "Every review below
is from a real client…" unconditionally — accurate in production; only mismatched under
the non-default placeholder deploy (which also shows the notice). Deferred; not a
production defect.

## AI experience — honest unavailable/future states
`lib/ai/matrix.ts` carries `status: "advisory" | "supported" | "future"` per action;
future actions carry a `futureReason`. Enforcement in `lib/ai/actions.ts:43-49`: demo
returns a `demo:true`-labeled result (dev only); a `future` action returns `{ status:
"unavailable", futurePhase: true }` — **never a fabricated result** in production.
Advisory/supported actions make **no provider call from the UI** (hand off to the
certified deterministic Copilot). `AiResultPanel.tsx` renders the unavailable branch as
"AI assistance isn't available here yet" with a "Future phase" tag; demo results carry a
visible `Demo` badge. **Capability registry not expanded in PX.1g.**

## Cleanup scan (production shipped code) — clean
No `console.log/debug/warn` in shipped components; no `TODO/FIXME/HACK`; no lorem ipsum;
no user-visible "BrightLoop" copy (the retained `@brightloop/*` packages, `--bl-*` vars,
and `brightloop.co` host constants are intentional per project decision); no stray
`localhost` in app code (host resolution correctly branches on environment). No debug UI.

## Result
**CERTIFIED.** Demo Mode remains production-safe, production fabricates no data, public
data comes from the intended real source, and AI states are honest. PX.1g made no change
to any guard, dataset, secret, or environment variable.
