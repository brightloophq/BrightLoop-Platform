# 17 · Open Decisions (require product-owner input)

> Per the integrity rules, these are **unresolved** — do not silently invent answers. Resolve with the
> product owner before or during the relevant phase. Add to this list rather than guessing.

## Product / scope
1. **Packages & pricing** — real package names, tiers, prices, and whether pricing is one-time, retainer,
   or hybrid. (Blocks Packages page, Configurator estimate, Proposals.)
2. **Configurator catalog** — final module list, dependencies, and how the "from" estimate is calculated
   (fixed prices vs ranges vs quote-only).
3. **Assessment scoring** — real questions and the Health Score formula/weights.
4. **AI Recommendation** — is "AI" rule-based (recommended for MVP) or an actual model call? If a model,
   which provider and what guardrails against fabricated claims?
5. **Multiple projects per client** — confirm the project-switcher UX and whether portal metrics aggregate
   across projects or show one at a time.
6. **Case study vs portfolio** — are `/case-studies/:slug` distinct long-form pages or a richer view of the
   same project record? (Prototype treats them as one record; confirm.)

## Sales / finance
7. **Contract e-signature** — build in-house typed/drawn signature, or integrate DocuSign/Dropbox Sign?
   (Affects `Contract` storage + legal validity.)
8. **Deposit vs full payment** — confirm deposit %, milestone billing schedule, taxes, and currency
   (currently USD, single currency).
9. **Refund policy** — who can refund and under what conditions.

## Platform / auth
10. **Client SSO** — offer Google SSO for clients at MVP or defer to V2?
11. **Team roles granularity** — are `client_admin`/`client_member` sufficient, or are per-feature client
    permissions needed?
12. **Admin message assignment / SLAs** — needed at MVP or V2?

## Content / trust
13. **Real proof** — timeline to obtain client-approved case studies, testimonials, and any disclosed metrics
    (nothing publishes until supplied; see `13`).
14. **Trust-bar logos** — which real client/partner logos may be shown.
15. **Legal pages** — who provides Privacy/Terms/Cookie copy and by when.

## Technical
16. **Rendering choice** — Next.js (SSR/SSG, best for public SEO) vs Vite SPA + prerender. Recommendation:
    Next.js for public, but confirm team preference.
17. **File-upload limits** — max size per file/type per context (assumed 25MB) and total storage quotas.
18. **Bot protection** — hCaptcha / Cloudflare Turnstile on public forms?
19. **Data residency / compliance** — GDPR/CCPA scope, Supabase region, retention periods.
20. **Notifications channels** — in-app only at MVP, or email + in-app (and which events are email-worthy)?

## Brand assets
21. **Logo package** — vector + transparent + light/dark variants + favicon/OG (current asset has a baked-in
    navy background). Blocks crisp branding, favicons, and social sharing.
