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

## 2b. Deploying — migrations are NOT automatic

⚠️ **Push migrations BEFORE the app code that needs them.** Nothing in CI applies
migrations to the live database: CI runs them against a throwaway local stack and
holds no production credentials. A deploy therefore ships code that may read a
column the live database does not have yet, and the failure appears at request
time, not at build time — a page that worked yesterday simply stops loading.

```bash
cd application
export SUPABASE_ACCESS_TOKEN=<personal access token>   # or: supabase login
supabase link --project-ref <ref>                      # prompts for the DB password
supabase db push                                       # applies every unapplied migration
```

⚠️ **Version numbers are the identity, not filenames.** `db push` records the
numeric prefix. If two working copies ever create different migrations under the
same prefix, whichever is pushed first claims that version and the other is
skipped FOREVER, silently — `supabase migration list` shows the version in both
columns, which is what makes it invisible. This happened at `20260812000100`
(`media_bucket_limits` here vs `quote_proposal_statuses` in a diverged copy);
the repair was to re-issue the skipped statement under a fresh version
(`20260815000100`), not to rewrite history on a live database.

⚠️ **Never push from a working copy that is not current `main`.** Anything it
applies that is not committed here becomes production schema this repository
cannot reproduce — invisible to CI, to the generated types, and to anyone
rebuilding the database from migrations.

This has bitten once already: `scan_findings.source` shipped with the app before
its migration reached the database and the Business Scan page stopped loading.
The admin pages now name a schema mismatch and the command that fixes it rather
than dying (`apps/web/src/lib/schema-drift.ts`), but the ordering is still the
real fix.

## 3. Security

- ✅ **RLS coverage**: verified live — all 34 public tables have RLS enabled + at least one policy (see `bl_rls_audit()`). No anon-readable holes; only published marketing content is public.
- ✅ **Draft/internal gates**: draft quotes, internal notes, internal pricing, pre-send proposals/contracts/invoices all invisible to clients (verified across live spikes).
- ✅ **Webhook signatures**: payment + signature + n8n webhooks verify HMAC against the raw body first, fail closed.
- ✅ **Security headers**: full CSP (Supabase + Turnstile only), HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy — verified served on the production build.
- ⚠️ **Rotate the Supabase secret key** if it was ever exposed (done this session — re-verify it's the current live key).
- ⚠️ **Owner bootstrap password**: change the initial owner password if it was set/shared during setup.
- 🔧 **CSP follow-up** (optional): tighten `script-src`/`style-src` from `'unsafe-inline'` to a nonce-based policy.

## 4. SEO / indexing

- ✅ **Site-wide indexing is ON** (`apps/web/src/app/layout.tsx`): flipped to `index: true` once the portfolio, reviews and written pages were real. The private surfaces used to inherit their `noindex` from that one line and declared none of their own, so `/portal`, `/admin` and `/workspace` now each set it in their own layout; `/start`, `/legal/*`, the auth pages and the funnel's result steps (`/recommendation`, `/roadmap`) carry their own too, and robots.txt disallows all of them. ⚠️ Legal copy is still unissued — the documents say so on their own pages and are excluded from the sitemap, but they are now reachable on an indexable site.
- ✅ Sitemap, robots.txt, canonical (every public page), OG, and JSON-LD are wired: `Organization` + `WebSite` from the public layout, `Article` on each written page, `CreativeWork`/review schema on portfolio and testimonials.
- ✅ **Canonical origin** is `auxion.xyz` (`SITE_ORIGIN`). It named `brightloop.co` until the site was launched, which pointed every canonical, sitemap URL and JSON-LD `url` at another domain. Override per deployment with `NEXT_PUBLIC_SITE_ORIGIN` so previews do not emit production canonicals.
- ✅ **Social profiles** (`apps/web/src/lib/site.ts`, `SOCIAL_PROFILES`): Instagram, TikTok and Facebook, linked in the footer and emitted as `sameAs`. ⚠️ The Facebook entry is a personal profile, not a business Page — swap it when a Page exists.
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
