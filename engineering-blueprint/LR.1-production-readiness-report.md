# LR.1 — Production Readiness & Launch Certification

_Branch `feat/lr1-production-readiness`, cut from `main` @ `5bc068e` (after PX.1h merged). Certifies the `main` production baseline. PX.1i (PR #85) is an independent, CI‑green, still‑open enhancement (see §Known risks)._

## Executive summary

Auxion's **code and configuration are production‑grade.** A full repository audit — three specialist code audits (production/SEO, security/auth, hygiene/data‑honesty) plus direct inspection of the production surface — found **no P0 launch blockers in the codebase** and only a small set of P1 items, **all of the code‑level ones fixed in this PR.** The security architecture (fail‑closed JWT auth, server‑only service role, HMAC webhooks, RLS‑scoped guarded writes, full CSP/HSTS header set), the data‑honesty seams (production‑hard‑off demo mode, labelled placeholder data, the `disclosedMetrics()` result gate, mock‑by‑default payments), and the maintainability baseline (no TODOs, no debug logging, no `any`, no dead code, green CI on `main`) are genuinely strong.

The remaining gap to "open the doors" is **not code** — it is a set of **operational / content go‑live gates** the owner must close (approve placeholder content, flip the site‑wide `robots` noindex, set real production hostnames, provision the Turnstile secret, and either disable real payments or build the Stripe adapter). These are enumerated in `docs/PRE-LAUNCH.md` and reproduced under *Known risks*.

> **Honest scope limitation.** This environment has **no database, no authenticated session, no running app, and a Browser pane that does not composite frames or hydrate** (documented across every PX/LR sprint). Therefore this is an **evidence‑based code + configuration certification**, not a runtime one. It does **not** include: live end‑to‑end journey execution, real Lighthouse/Core‑Web‑Vitals numbers, an automated axe/screen‑reader pass, or live penetration testing. Those are called out where relevant and remain the owner's pre‑launch responsibility. Scores reflect what the code/config evidence supports, with runtime‑only dimensions explicitly caveated.

## Scores (evidence‑based code/config certification)

| Dimension | Score | Basis |
|---|---:|---|
| **Launch readiness (overall)** | **86 / 100** | Code is ready; go‑live gated on operational/content items, not defects. |
| Architecture | 93 / 100 | Three‑layer integrity (capability → transition trigger → RLS); clean schema→domain→data→application→web layering; server‑only boundaries; guarded transitions; Node‑free pure domain. |
| Security | 90 / 100 | Fail‑closed ES256 JWT auth; service role server‑only; HMAC (timing‑safe) webhooks; RLS‑scoped writes; CSP+HSTS+nosniff+X‑Frame+Referrer+Permissions. Two P1s fixed here; `script-src 'unsafe-inline'` deferral remains. |
| UX | 85 / 100 | Unified design system; theme runtime; motion system; empty/error/loading states now including public + global boundaries. Not visually verified here; PX.1i polish still in #85. |
| Performance | 82 / 100* | GSAP/ScrollTrigger code‑split + `useGSAP`/`matchMedia` auto‑cleanup; self‑hosted `next/font` (swap); transform/opacity‑only motion; public First‑Load ~205 kB. *No runtime LCP/CLS/INP measured. |
| Accessibility | 84 / 100* | Skip‑link, `:focus-visible` ring, reduced‑motion honoured, `role="alert"` boundaries, `lang`, labelled controls, landmarks. *No automated axe / screen‑reader pass run here. |
| Maintainability | 89 / 100 | No TODO/FIXME, no debug logging, no dead code, no runtime `any`; per‑package Vitest; green CI gate. Minus: `ENGINEERING_CONTEXT.md` was stale (updated here); 6 open PRs + stale branches to triage. |

\* Runtime‑measured dimensions the environment could not exercise; treat as code‑level confidence, not measured field data.

## Step 1 — Repository certification

- **CI on `main`: green** (latest run = the #83 merge, success). 48 migrations present; generated types committed (381 KB); type‑drift verified by the `db-verify` CI job on every PR.
- **Clean tracked tree**, protected untracked `engineering-blueprint/phase-d/*` files preserved.
- **Inconsistencies with the "all merged / clean" premise (reported, not silently accepted):**
  - **6 open PRs**: #85 (PX.1i, intentionally open), #75 (F5 Billing — "leave open"), #66 (F3.5 Product UI), #10 (DB‑migration workflow), #7 (Phase‑0 design system — **superseded** by merged #8; recommend close), #6 (Insights — held for canonical rebuild). Triage recommended; none block a launch of what is on `main`.
  - **Many stale local + remote feature branches** (f4‑*, e‑*, sprint/06‑insights, migration/phase‑0, …). Pure hygiene; recommend prune.
  - **`ENGINEERING_CONTEXT.md` header was stale** ("Last updated: after Phase D · Sprint D8") despite sections through §22 (PX.1). Updated in this PR (§23 LR.1 + header).

## Steps 2–3 — Product & journey audit (code‑level)

Every major surface exists on `main` and is wired to real read models with honest empty states: landing, auth (`/login`, verified‑JWT middleware), public signup (`/start`, Turnstile‑gated, service‑role), Console/dashboard, Signals, Business Scan, Activation, System Map, Analytics, portfolio/case‑studies/testimonials (publish‑gated CMS), and the authenticated workspace (copilot, projects, executions, integrations, runtimes, reports, settings). Journeys **compile and are structurally complete**; end‑to‑end execution requires a live DB + auth session and must be validated by the owner on a preview with real data. No journey is missing its route, guard, or read model.

## Step 4–8 — Production, performance, accessibility, security, design

- **Production config:** `next.config.mjs` ships the full header set + `no-store` on portal/admin, `poweredByHeader:false`, `reactStrictMode:true`, and **no** `ignoreBuildErrors`/`ignoreDuringBuilds`. `robots.ts`/`sitemap.ts`/`not-found.tsx` present and correct; sitemap publish‑gated. Root `robots: index:false` is the intentional, documented launch flip.
- **Security:** see scores; two P1s fixed here (below). Auth fails closed at every branch; no unauthenticated mutation endpoint; no client‑side secret; no exploitable direct‑write bypass.
- **Data honesty:** demo mode returns `false` the instant `VERCEL_ENV==="production"` (before any cookie/env read); placeholder datasets are banner‑labelled with `disclosed:false`; result metrics only render through `disclosedMetrics()`; payments default to a deterministic mock whose webhook verify never blanket‑passes.
- **Design consistency:** one token system (`--bg/--surface/--ink/--signal/--line*` + scales), `--signal` as the single amber accent, restrained radii/elevation; PX.1i (pending in #85) further unifies button/card/rating micro‑interactions.
- **Performance/accessibility:** code‑level confidence per scores; runtime measurement deferred to the owner.

## Step 10 — Implemented fixes (P0 + P1, code only)

- **P0:** none found.
- **P1‑1 — Turnstile fails CLOSED in production** (`apps/web/src/lib/turnstile.ts`). The public, service‑role‑backed signup's only bot gate previously no‑op‑passed whenever `TURNSTILE_SECRET_KEY` was unset. Now an unset secret in `VERCEL_ENV==="production"` rejects (fail closed); dev/preview keep the no‑op so local/staging signup still works.
- **P1‑2 — Public route error boundary** (`apps/web/src/app/(public)/error.tsx`, new). Marketing pages fetch published CMS content from Supabase and had **no** error boundary — an uncaught render/fetch error white‑screened. Now delegates to the shared, accessible `RouteError` primitive inside the marketing chrome.
- **P1‑3 — Root `global-error.tsx`** (new). The only boundary that catches a failure in the root layout itself; deliberately self‑contained (its own `<html>/<body>`, no token/theme dependency) and brand‑consistent.
- **P1‑4 — JSON‑LD injection hardening** (`apps/web/src/lib/json-ld.ts` + test; applied in `testimonials/page.tsx` and `portfolio/CaseStudyView.tsx`). `JSON.stringify` doesn't escape `<`/`>`/`&`/U+2028/U+2029; `safeJsonLd()` rewrites them to `\uXXXX`, closing a stored‑XSS breakout vector on the public site (input is moderated CMS content — defence‑in‑depth).

## Step 11 — Validation

Full workspace gate on this branch: **`typecheck · lint · test · build` = 36/36 tasks green** (includes the new `json-ld` test; build rendered the full route tree with no prerender/hydration errors). The `db-verify` (migrate · pgTAP · RLS · adapter · type‑drift) and `gitleaks` gates are unchanged by this branch and run on CI. This PR adds **no** migration, generated‑type, backend, or dependency change.

## Known risks (owner‑owned go‑live gates — cannot be closed in code)

1. **Content still placeholder** — service catalog, internal pricing, legal pages, marketing/discipline copy (`docs/PRE-LAUNCH.md §1`). Approve or replace; enter real testimonials/portfolio via the Reputation CMS (never seed in code).
2. **`robots` site‑wide noindex** (`layout.tsx:26`) — correctly OFF while content is placeholder; **flip to `index:true` at launch** (keep `/portal`,`/admin`,`/start` noindex — they already are).
3. **Real production hostnames** (`NEXT_PUBLIC_PUBLIC_HOST`/`PORTAL_HOST`/`ADMIN_HOST`) — middleware routes surfaces by subdomain.
4. **Provision `TURNSTILE_SECRET_KEY` in production** — now enforced (signup fails closed without it), so it is a hard prerequisite to enable public signup.
5. **Payments** — real charges settle via a mock until the concrete `StripePaymentProvider` + webhook parsing are built and tested. **Do not take real payments until then** (or keep payments disabled).
6. **Operational** — WAF/rate‑limit + error monitoring (e.g. Sentry) in front of the app; confirm Supabase backup/PITR cadence; rotate any exposed Supabase secret and the initial owner password.
7. **Manual QA the environment could not perform** — a screen‑reader pass + colour‑contrast check on the funnel→signup→portal path; interactive Light/Dark/System + reduced‑motion review; a real Core‑Web‑Vitals/Lighthouse run; a live pen test.
8. **Repository hygiene** — triage the 6 open PRs (close superseded #7; decide #66/#10; #6/#75/#85 intentionally open) and prune stale branches.

## Deferred improvements (justified, not implemented)

- **`script-src`/`style-src 'unsafe-inline'` → nonce‑based CSP.** Genuine hardening, but converting Next's inline bootstrap + the anti‑FOUC theme script + inline styles to nonces carries real regression risk and **cannot be visually verified in this environment**; not appropriate to change blindly in a certification sprint. Cross‑origin script/frame/form/object are already blocked. Track as a follow‑up.
- **Root Open Graph/Twitter defaults + `metadataBase` + homepage Organization/WebSite JSON‑LD** (P2 SEO). Child pages already emit absolute canonical/OG URLs; these add share‑preview/rich‑result polish once indexing is on.
- **`next/image` `remotePatterns` allowlist** (P3) — add when remote images are introduced.

## Recommended launch decision

**READY AFTER P0 + P1 FIXES.**

Justification, by evidence: the codebase has **no P0**; the **code‑level P1s are fixed and gate‑green in this PR**; architecture, security, and data‑honesty are certified strong at the code/config level. The platform is **engineering‑certified production‑ready**. It is **not yet "open to customers"** solely because of the **operational/content go‑live gates** in *Known risks* (content approval, robots flip, hostnames, Turnstile provisioning, payments) — none of which are code defects and all of which are the owner's to close, followed by the runtime QA this environment could not perform. Once those gates are closed and a preview‑based visual/SR/CWV pass is done, Auxion is ready for real customers.
