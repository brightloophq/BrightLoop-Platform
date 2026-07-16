# 11 · Non-Functional Requirements — Auth/Authz, Accessibility, Performance, Security & Privacy

> Covers required topics **16 (authentication & authorization)**, **21 (accessibility)**,
> **22 (performance)**, **23 (security & privacy)**.

---

## 1. Authentication & authorization (topic 16)
- **Auth provider:** Supabase Auth. Email/password + magic-link; consider SSO (Google) for clients — confirm.
- **Session:** JWT with short-lived access + refresh; secure, httpOnly cookies (or Supabase client with
  secure storage). Idle timeout + absolute expiry; re-auth for sensitive actions (payment, contract sign, role change).
- **Token/magic-link flows:** sales/activation pages (`/proposal|contract|payment|activate/:token`) use
  single-purpose, expiring, single-use tokens scoped to one client + one action. Expired/used → request new link.
- **Authorization:** role from `ROLES`; capabilities from `PERMISSIONS` (`reference/schema.js`). Enforce at:
  1. **UI** — hide role-gated actions, disable contextually-unavailable ones.
  2. **API/service** — capability check on every mutation; state-transition guard `can()`.
  3. **Database** — Supabase **RLS** on every client-scoped table (`clientId = auth.client_id`); internal
     tables gated by role claim. RLS is the real boundary; UI is convenience.
- **Least privilege:** `client_member` cannot approve/pay/sign/invite; `team_member` cannot touch
  finance/marketing/automation/settings. Signing + paying = `client_admin` only.
- **Audit:** log auth events + every state transition + role change (actor, entity, from→to, at, ip).

## 2. Accessibility (topic 21) — target WCAG 2.1 AA
- **Contrast:** verify all text/token pairs meet AA (4.5:1 body, 3:1 large). Dark theme: `--text-secondary`
  on `--surface-card` passes; muted text only for non-essential labels. Never convey status by color alone —
  pair badge color with text/icon (the `dot` + label pattern).
- **Keyboard:** every interactive element reachable + operable; visible focus using `--ring-focus`
  (`0 0 0 3px rgba(34,211,238,.35)`); logical tab order; no keyboard traps. Drawers/modals trap focus while
  open, close on Escape, restore focus to trigger.
- **Semantics/ARIA:** landmark regions (header/nav/main/footer); headings in order; form fields have `<label>`;
  errors via `aria-describedby` + `aria-invalid`; icon-only buttons have `aria-label`; star ratings expose a
  text label ("4.8 out of 5"); live regions for toasts/async status.
- **Media:** images require **alt text** (enforced in Media Library); decorative images `alt=""`; video needs
  captions (V2 for client media); iframes titled.
- **Motion:** honor `prefers-reduced-motion` — disable entrance reveals + shimmer; no essential info in motion.
- **Targets:** ≥44×44px touch targets on mobile.

## 3. Performance (topic 22)
- **Budgets:** LCP < 2.5s, CLS < 0.1, INP < 200ms on public pages (4G/mid-mobile). Initial JS for public
  route ≤ ~200KB gz — code-split portal/admin out of the public bundle.
- **Public pages:** SSR/SSG + cached; fonts (`Space Grotesk`, `Inter`) preloaded + `font-display: swap`;
  images responsive (`srcset`, lazy-load below fold, AVIF/WebP), explicit dimensions to avoid CLS.
- **Data views:** server-side pagination + indexed filters for portfolio/admin at scale; virtualize very long
  lists; debounce search; optimistic UI for approvals/toggles with rollback on error.
- **Caching:** CDN for static + public API responses (published portfolio/testimonials) with revalidation on
  publish. Skeletons instead of layout shift while loading.
- **Assets:** self-host fonts; tree-shake Lucide icons (import per-icon, not the whole set).

## 4. Security & privacy (topic 23)
- **Transport:** HTTPS everywhere; HSTS; secure cookies; CSP (restrict script/style/img/connect origins to
  self + Stripe + Supabase + calendar embed); frame-ancestors none for app/admin.
- **Data protection:** RLS as above; server-side validation of all inputs; parameterized queries (Supabase
  handles); output encoding to prevent XSS; sanitize any rich text (messages, case-study copy) before render.
- **Secrets:** Stripe/n8n/email/calendar keys server-side only; webhooks signature-verified (Stripe signing
  secret); never expose service-role keys to the client.
- **PII & privacy:** minimize stored PII; `Consent` entity records cookie/marketing/terms consent with
  version, timestamp, ip. Cookie banner ties to Consent. Support data export + deletion (GDPR/CCPA) — V1 manual,
  V2 self-serve (see `14`). Payment data is tokenized by Stripe — **never store PAN**; only `last4`/method.
- **Rate limiting & abuse:** throttle auth, contact, assessment submissions; bot protection on public forms
  (hCaptcha/Turnstile — confirm). Signed, expiring URLs for private files/media in Storage.
- **Integrity enforcement:** the public API must not be able to return unpublished/private portfolio or
  testimonial rows even with a crafted request — enforced by RLS, tested in `15`.
