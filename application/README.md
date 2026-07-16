# BrightLoop Platform

Monorepo for the BrightLoop Business Growth Platform — a single deployable
Next.js application serving four surfaces (public marketing, authentication,
client portal, admin command center) on one canonical data model and state
machine set, backed by Supabase.

> **Status:** Sprint 0 — Foundations. No production/business features yet.
> Public marketing, portal, and admin pages are **skeletons** that prove routing,
> authorization, and design-system wiring. Real features arrive in later sprints.

## Workspace layout

```
application/
├─ apps/
│  └─ web/            Next.js 15 App Router — all four surfaces via route groups
├─ packages/
│  ├─ schema/         SINGLE SOURCE OF TRUTH — roles, permissions, entities,
│  │                  state machines, transition guards, status→tone map
│  ├─ domain/         Service layer — transition guard, capability checks,
│  │                  domain events, integration adapters (+ mocks)
│  ├─ ui/             Design system — tokens (verbatim) + components
│  └─ db/             Supabase SQL migrations + RLS policies + config
└─ docs/handoff/      (repo root) Approved product specification
```

## Prerequisites

- Node.js >= 20 (tested on 22)
- pnpm 9 (via corepack: `corepack enable pnpm`)

## Getting started

```bash
corepack enable pnpm
pnpm install
cp .env.example apps/web/.env.local   # then fill in real values

pnpm dev          # run the app locally
pnpm check        # lint + typecheck + test + build (the sprint gate)
```

## Architecture invariants (do not violate)

1. **`packages/schema` is the source of truth.** DB migrations, TS types, Zod
   validators, and authorization guards derive from it. If code and schema
   disagree, schema wins.
2. **Three-layer integrity enforcement.** Every state change is validated in the
   UI (hide/disable), the service layer (`can()` guard + capability check), and
   the database (RLS + transition trigger). RLS is the real boundary.
3. **No fabricated proof.** Metrics/testimonials/portfolio results are placeholder
   until real, client-approved content replaces them. Publish gating is enforced
   in the data layer, not just the UI.
4. **No client-side secrets.** Only `NEXT_PUBLIC_*` values reach the browser.

See `docs/handoff/` for the full approved specification.
