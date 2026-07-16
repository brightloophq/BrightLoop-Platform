# 12 · Integration Boundaries & Analytics Events

> Covers required topics **24 (integration boundaries: Supabase, Stripe, n8n, email, calendar)** and
> **25 (analytics events)**.

---

## 1. Integration boundaries (topic 24)

### Supabase (DB + Auth + Storage)
- **Database:** Postgres; schema generated from `reference/schema.js` (`ENTITIES`). Each stateful table has a
  `status` column constrained to its machine's enum. Add a `transition_log` table (entity, from, to, actor,
  reason, at). Enable RLS on every table.
- **Auth:** email/password + magic-link + (optional) Google SSO. Custom claims carry `role` + `client_id`.
- **Storage:** buckets for `deliverables`, `media` (portfolio/case-study), `avatars`, `contracts` (SOWs,
  private). Public read only for the `media` bucket's **published** assets; everything else via signed URLs.
- **Boundary:** all writes go through service functions that run the transition guard + capability check —
  clients never write status directly.

### Stripe (payments)
- **Scope:** deposit invoice at activation + ongoing invoices (milestone/final/retainer). Use Payment
  Intents / Checkout + Elements for card & ACH.
- **Flow:** create PaymentIntent server-side for an `Invoice`; client confirms; **webhooks** drive truth —
  `payment_intent.succeeded` → `payment: succeeded`, `invoice: paid`, unblock activation;
  `payment_intent.payment_failed` → `payment: failed`; `requires_action` → `pending_3ds` waiting state;
  ACH pending → waiting until settled. Verify webhook signatures. Store only `last4`/method, never PAN.
- **Refunds:** admin-initiated → `invoice: paid→refunded`.

### n8n (automation)
- **Scope:** the `Automation` entity monitors n8n workflows (intake→CRM, review requests, dunning emails,
  onboarding nudges, notifications). BrightLoop app **triggers** workflows via webhook and **receives**
  status callbacks (run started/success/failed, lastError).
- **Boundary:** n8n owns orchestration; the app owns state display + retry/mute controls. `failed` → alert
  admin (Automation Monitoring), client sees "attention needed" only where relevant.

### Email (transactional)
- **Provider:** Resend/Postmark (via n8n or backend). Triggered by domain events (see analytics/events overlap):
  magic links, proposal sent, contract to sign, payment receipt/failure, activation welcome, milestone
  awaiting approval, invoice issued/overdue (dunning), meeting confirmations, review requests.
- **Boundary:** templates + sending live outside the app; the app emits events with the payload. No marketing
  email without `Consent`.

### Calendar / scheduling
- **Provider:** Google Calendar + a scheduler (Cal.com/Calendly). Booking on public `/contact`, funnel roadmap,
  and portal `/meetings`. Creates `Meeting` with `joinUrl`; two-way sync of availability + created events.
- **Boundary:** scheduler owns availability/booking UI (embed or API); the app stores the resulting `Meeting`.

### Integration principle
All third parties are **connectors, not sources of truth for app state**. The app's state machines are
authoritative; external systems notify via webhooks, and the app reconciles + guards every transition.

---

## 2. Analytics events (topic 25)
Emit a typed event on each meaningful action (client-side for UX funnel, server-side for money/state truth).
Recommended taxonomy `domain.object.action` with common props `{ userId?, clientId?, role?, ts, source }`.

**Acquisition / public**
- `page.view` (path, referrer) · `nav.mega_menu.open` · `cta.click` (id, location)
- `portfolio.search` (query) · `portfolio.filter.apply` (facet, value) · `portfolio.sort.change` (value)
- `portfolio.project.view` (slug) · `portfolio.live_site.click` (slug) · `testimonials.view` · `testimonial.project.click`

**Funnel**
- `assessment.start` · `assessment.step.complete` (step) · `assessment.abandon` (step) · `assessment.complete` (healthScore)
- `configurator.module.add`/`.remove` (moduleId) · `configurator.estimate.view` (low, high)
- `recommendation.view` · `roadmap.view` · `booking.open` · `booking.complete` (meetingId)

**Sales & activation**
- `proposal.view` · `proposal.accept` · `proposal.change_request` · `contract.sign` · `contract.countersign`
- `payment.initiate` · `payment.succeed` · `payment.fail` (reason) · `activation.complete`
- Each mirrors a state transition — emit from the server on the guarded transition.

**Portal**
- `deliverable.approve` · `deliverable.revision_request` · `deliverable.comment` · `invoice.pay` ·
  `message.send` · `meeting.schedule` · `health.reassess` · `notification.click` (entityRef)

**Admin / reputation**
- `lead.stage.change` (from,to) · `project.status.change` · `milestone.status.change`
- `portfolio.publish` (slug, status) · `portfolio.schedule` · `review.moderate` (id, status) ·
  `review.pin` · `content.feature_home.toggle` (type, id) · `automation.retry` · `media.upload`

**Rules:** no PII in event names; respect consent for analytics cookies; server-side events for anything
financial or state-changing so the funnel/rev numbers in Admin Analytics are real (not client-inferred).
