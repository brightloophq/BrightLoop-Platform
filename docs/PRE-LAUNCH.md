# BrightLoop — Pre-Launch Integrity Checklist

Everything that must be true before a public go-live. Grouped by what only a
human can decide/provide (⚠️ **you**) vs. what's already handled (✅) vs. a
config flip (�flip). Nothing here fabricates data or credentials.

---

## 1. Content — replace placeholder/sample data

The catalog and marketing copy ship as **placeholder** data (`packages/data/src/placeholder/*`). It's clearly labelled and never presented as real client work, but it must be replaced or approved before launch.

- ⚠️ **Service catalog** (`PLACEHOLDER_MODULES`, `PLACEHOLDER_PLANS`, `PLACEHOLDER_CONTENT`): module names, package tiers (Starter/Growth/Enterprise), deliverables, outcomes, industries, timelines. Approve as-is or edit the dataset.
- ⚠️ **Internal pricing** (`PLACEHOLDER_MODULES[].from`): the internal effort/estimate model runs off these numbers. They are **never shown to a prospect** (internal-only `pricing_estimates` table), but a strategist sees them when building a quote — confirm they're sane.
- ⚠️ **Testimonials & portfolio**: enter real, consented client proof via the admin **Reputation CMS** (`/admin/reviews`, `/admin/portfolio`). Publish-gated — only rows marked `public`/`featured` appear on the marketing site. Do **not** seed these into code.
- ⚠️ **Legal pages** (`/legal/privacy`, `/legal/terms`, `/legal/cookies`): placeholder copy — have them reviewed by counsel.
- ⚠️ **Discipline/marketing copy** (`PLACEHOLDER_DISCIPLINE_COPY`, home page): review the public-facing prose.

## 2. Integrations — provider keys (mock-behind-env until set)

Each integration works as a deterministic **mock** until its key is set, then selects the real provider. See `.env.example`.

- ✅ **Cloudflare Turnstile** (anti-bot on signup): configured and verified live. Enforcing.
- ⚠️ **Stripe** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`): the concrete `StripePaymentProvider` + Stripe-event webhook parsing still need to be built and verified against your test account. Until then payments settle via the in-app mock. **Do not take real payments until this is built + tested.**
- ⚠️ **E-signature** (`ESIGN_API_KEY`, `ESIGN_WEBHOOK_SECRET`): vendor not chosen (DocuSign / Dropbox Sign). Client signing works in-app (typed signature) via the mock; a real envelope flow needs the vendor adapter.
- ⚠️ **Email** (`EMAIL_PROVIDER_API_KEY`): pipeline + consent gate are real; the concrete provider adapter (and a template strategy — templates are delegated to the provider/n8n) still needed for real sends. Supabase's built-in mailer is capped at ~2/hour; set custom SMTP in the Supabase dashboard to lift it.
- ✅ **n8n automations** (`N8N_WEBHOOK_SECRET`): signed callback receiver built; point it at your n8n instance.

## 3. Security

- ✅ **RLS coverage**: verified live — all 34 public tables have RLS enabled + at least one policy (see `bl_rls_audit()`). No anon-readable holes; only published marketing content is public.
- ✅ **Draft/internal gates**: draft quotes, internal notes, internal pricing, pre-send proposals/contracts/invoices all invisible to clients (verified across live spikes).
- ✅ **Webhook signatures**: payment + signature + n8n webhooks verify HMAC against the raw body first, fail closed.
- ✅ **Security headers**: full CSP (Supabase + Turnstile only), HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy — verified served on the production build.
- ⚠️ **Rotate the Supabase secret key** if it was ever exposed (done this session — re-verify it's the current live key).
- ⚠️ **Owner bootstrap password**: change the initial owner password if it was set/shared during setup.
- 🔧 **CSP follow-up** (optional): tighten `script-src`/`style-src` from `'unsafe-inline'` to a nonce-based policy.

## 4. SEO / indexing

- �flip **Site-wide `robots: index:false`** (`apps/web/src/app/layout.tsx`): the whole site is `noindex` while content is placeholder. **Flip to index once real content is in** — keep `/portal`, `/admin`, `/start` noindex (they already are, and are behind auth).
- ✅ Sitemap, robots.txt, canonical, OG, JSON-LD (portfolio/testimonials) are wired.
- ⚠️ Set real production hostnames (`NEXT_PUBLIC_PUBLIC_HOST` / `PORTAL_HOST` / `ADMIN_HOST`) — middleware routes surfaces by subdomain.

## 5. Accessibility (WCAG 2.1 AA)

- ✅ `html lang`, visible focus ring (`:focus-visible`), reduced-motion honoured.
- ✅ Skip-to-content link + `<main id="main-content">` landmark on all three shells.
- ✅ `.sr-only` utility; heading order fixed on services/portfolio/packages.
- ✅ Form controls labelled; icon-only buttons have `aria-label`; `target="_blank"` links carry `rel="noopener noreferrer"`.
- ⚠️ **Recommended before launch**: a manual screen-reader pass (NVDA/VoiceOver) on the funnel → signup → portal happy path, and a colour-contrast check on the final brand palette.
- ⚠️ **Web fonts**: the design references Space Grotesk / Inter / JetBrains Mono but **does not load them** (falls back to system fonts). If brand typography matters, add self-hosted `@font-face` (keeps CSP `font-src 'self'`).

## 6. Abuse / operational

- ✅ Public signup is Turnstile-gated (once enforcing).
- ⚠️ **Rate-limiting / monitoring**: consider a WAF/rate-limit in front of the app and error monitoring (Sentry or similar) before a public opening.
- ⚠️ **Backups**: confirm Supabase point-in-time recovery / backup cadence for the project.
- ✅ Every sensitive status change is audit-logged (`transition_log`, append-only).

---

### Go-live gating summary

**Safe to open publicly once:** content approved (§1), robots flipped to index (§4), real hostnames set (§4), and either payments are mock/disabled or the Stripe adapter is built + tested (§2). Turnstile, RLS, headers, and the audit trail are already launch-ready.
