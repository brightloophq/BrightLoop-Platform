# 14 · MVP vs Deferred V2

> Covers required topic **28 (MVP requirements vs deferred Version 2 features)**.

The goal of MVP: run the **core revenue loop** end-to-end — prospect discovers → assesses → configures →
receives proposal → signs → pays → is activated → is served in the portal, with an internal admin to run it —
plus a credible, honest public reputation surface. Everything not on that critical path is V2.

---

## MVP (Version 1) — required to launch

**Public**
- Homepage, Services (overview + detail), Packages/pricing, Contact + booking.
- Portfolio (filter/search/sort/pagination) + project case study (with honest metric gating) + Testimonials.
- Business Health Assessment → Configurator → AI Recommendation → Roadmap funnel (deep-linkable, resumable).
- Auth (login/signup/reset/verify). Legal pages (with real content).
- SEO essentials: SSR/prerender for public routes, meta + canonical + JSON-LD for portfolio/testimonials, sitemap/robots.

**Sales & activation**
- Proposal review (accept / change request), Contract e-sign + countersign, Stripe deposit payment,
  Account activation → portal. Full proposal→contract→invoice→payment→activation state machines + guards.

**Client portal**
- Dashboard overview, Project progress, Milestones, Deliverables with **approve / request-revision**, Files,
  Messages, Invoices & payments, Notifications, Account + Team settings, Business Health Score (computed).

**Admin**
- Executive overview, Leads/CRM, Clients, Projects, Milestones, Deliverables review, Proposals, Contracts,
  Invoices, **Portfolio & case-study management**, **Testimonial moderation**, Media library, Team & permissions,
  Content publishing (homepage feature flags). Basic analytics (real funnel numbers).

**Cross-cutting**
- Roles + RLS enforcement; all state-machine guards; the full set of UI states (empty/loading/error/success/
  waiting/disabled); WCAG AA; Supabase + Stripe + basic email + calendar booking + n8n trigger/status for the
  essential automations (intake, dunning, review request, approval nudges).

---

## Deferred to Version 2

- **AI-powered search** over portfolio/knowledge; semantic recommendations beyond rule-based.
- **Infinite scroll** on portfolio (MVP uses pagination); saved searches; category/tag landing pages at scale.
- **Advanced analytics** dashboards (cohorts, attribution, LTV), custom report builder.
- **Client-side self-serve** data export/deletion (MVP handles manually); granular consent center.
- **Recommended-services automation** (auto-generated upsell proposals); retainer/subscription billing UI.
- **Video captions / transcripts** for client media; richer media types (audio players, embedded galleries).
- **Multi-currency / i18n / localization**; multi-brand.
- **Admin message assignment / SLA tooling**; internal task management beyond deliverables.
- **SSO for clients**, SCIM, and org-level security policies.
- **Native mobile apps** (responsive web is MVP).
- **A/B testing framework** for marketing pages.
- **Automation builder UI** inside the app (MVP monitors n8n; building stays in n8n).

Anything ambiguous about the MVP/V2 line is captured in `17-open-decisions.md`.
