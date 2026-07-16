# 02 · Data Model & Entity Relationships

> Covers required topics **4 (data-model specification)** and **5 (entity relationships)**.
> **Canonical source:** `reference/schema.js` → `ENTITIES` (field contracts), `ROLES`,
> `PERMISSIONS`. Generate DB tables, TypeScript types, and RLS from that file. This document is
> the human-readable companion — if it and `schema.js` disagree, `schema.js` wins.

---

## 1. Conventions

- **IDs:** prefixed ULIDs — `usr_`, `cli_`, `lead_`, `asm_`, `cfg_`, `prop_`, `ctr_`, `inv_`,
  `pay_`, `prj_`, `mst_`, `dlv_`, `file_`, `auto_`, `mtg_`, `ntf_`, `msg_`, `cns_`, plus reputation
  `p_` (project) and `t_` (testimonial). Prefixes aid readability and are sortable.
- **Timestamps:** ISO-8601 strings (`createdAt`, `…At`). Store as `timestamptz`.
- **Status fields:** every stateful entity has a `status` (or `stage`/`lifecycle`) drawn from its
  machine's enum in `MACHINES` (see `03-state-machines.md`). Never free-text.
- **Money:** store integer minor units (cents) + currency; the prototypes display formatted USD.
- **Tone mapping:** `schema.js` → `STATUS_TONE` / `toneFor(status)` maps any status to a
  design-system Badge/Alert tone. Reuse it so status color is consistent everywhere.

---

## 2. Entities (field contracts)

Exact field lists are in `reference/schema.js`. Summary + notes:

### Identity & accounts
- **User** — `id, name, email, role, clientId, status, avatarUrl, lastActiveAt, invitedAt, acceptedAt`.
  `role ∈ ROLES`. `clientId` null for internal users. `status` = invited/active/suspended.
- **Client** (org) — `id, company, plan, mrr, lifecycle, healthScore, accountManagerId, createdAt, industry, seats`.
  `lifecycle ∈ clientLifecycle`. One Client has many Users (seats).
- **Consent** — `id, userId, type, granted, version, timestamp, ip`. GDPR/privacy audit trail
  (cookie, marketing, terms). Append-only.

### Acquisition funnel
- **Lead** — `id, name, company, email, industry, value, stage, ownerId, source, createdAt`.
  `stage ∈ lead`. `ownerId` → internal User. May convert to Client.
- **Assessment** — `id, clientId, answers, scores, healthScore, recommendations, status, submittedAt`.
  Feeds Health Score + AI recommendation. `status ∈ onboarding`.
- **Configuration** — `id, clientId, assessmentId, modules, ownedAssets, estimateLow, estimateHigh, status, updatedAt`.
  Configurator output; `ownedAssets` drives de-duplication of `modules`; estimate is a **range**.

### Sales & activation
- **Proposal** — `id, clientId, configurationId, lineItems, subtotal, deposit, total, status, sentAt, viewedAt, decidedAt, changeNote`.
  `status ∈ proposal`. `changeNote` holds the client's change request.
- **Contract** — `id, proposalId, clientId, sowUrl, clientSignature, countersignature, status, signedAt`.
  `status ∈ contract`. Signing blocks project kickoff until `active`.
- **Invoice** — `id, clientId, projectId, type, amount, dueDate, status, issuedAt, paidAt`.
  `type` = deposit/milestone/final/retainer. `status ∈ invoice`.
- **Payment** — `id, invoiceId, method, last4, amount, status, processedAt, failureReason`.
  `status ∈ payment`. Created per attempt; Stripe is the processor (see `12-integrations`).

### Delivery
- **Project** — `id, clientId, name, status, progress, startDate, targetDate, managerId, milestoneIds`.
  `status ∈ project`. `progress` 0–100 (derived from milestones). A Client may have many Projects.
- **Milestone** — `id, projectId, title, status, order, dueDate, approvedAt`. `status ∈ milestone`.
  `order` is user-reorderable.
- **Deliverable** — `id, projectId, milestoneId, title, type, status, version, fileUrl, feedback, submittedAt`.
  `status ∈ deliverable`. `version` bumps on each revision; `feedback` holds revision notes.
- **FileUpload** — `id, ownerId, deliverableId, name, size, mime, status, progress, error, uploadedAt`.
  `status ∈ fileUpload`. Progress 0–100; `error` holds size/type/network reason.

### Communication & ops
- **Message** — `id, threadId, authorId, clientId, body, attachments, createdAt`. Threaded per client.
- **Meeting** — `id, clientId, title, type, startAt, durationMin, attendees, status, joinUrl`.
- **Notification** — `id, userId, kind, title, body, entityRef, read, createdAt`. `entityRef`
  deep-links to the source entity.
- **Automation** — `id, clientId, name, provider, trigger, status, runs, lastRunAt, lastError`.
  `status ∈ automation`. `provider` = n8n (see `12-integrations`).

### Reputation (public marketing)
Source of truth for these two: `reference/reputation-data.js`.
- **PortfolioProject** — `id, slug, name, client, industry, size, country, year, services[], budget,
  tech[], platform, timeline, deliverablesCount, completedDate, projectStatus, publish, featuredOnHome,
  awards[], liveUrl, permissionLivePreview, tags[], summary, challenge, approach, heroSlot,
  gallerySlots[], media[], metrics{disclosed, …}, testimonialId, seo{title, description, ogImage}`.
  `publish ∈ {featured, public, draft, private}`. `metrics.disclosed` gates all result numbers.
- **Testimonial** — `id, projectSlug, author, role, company, country, date, publish, pinned,
  featuredOnHome, avatarSlot, overall(1–5), categories{communication, quality, timeliness, value,
  professionalism}, quote, media[]`.

---

## 3. Entity-relationship diagram (logical)

```
Client 1───* User
Client 1───* Project           Project 1───* Milestone 1───* Deliverable *───1 Milestone
Client 1───1 Assessment ──1 Configuration ──1 Proposal ──1 Contract
Client 1───* Invoice 1───* Payment
Client 1───* Message (threadId)      Client 1───* Meeting      Client 1───* Automation
User   1───* Notification            User    1───* Consent
Lead   0..1─1 Client (on conversion)  User(internal) 1───* Lead (ownerId)
User(internal, managerId) 1───* Project
Deliverable 1───* FileUpload

# Reputation (marketing) — logically separate, publish-gated:
PortfolioProject 0..1─1 Testimonial (testimonialId ↔ projectSlug)
PortfolioProject 1───* Media(slot|url)     Testimonial 1───* Media
```

Key cardinalities & rules:
- **Client is the aggregate root** for all portal data; every client-scoped table carries
  `clientId` for RLS.
- **Project → Milestone → Deliverable** is the delivery spine; `Project.progress` is derived from
  milestone completion, not stored authoritatively.
- **Configuration.modules** minus **Configuration.ownedAssets** = billable scope (de-dup logic lives
  in the configurator; persist both so the proposal is reproducible).
- **Proposal → Contract → Invoice → Payment** is the money spine; activation (`Client.lifecycle →
  client_active`) is gated on `payment.succeeded` **and** `contract.active`.
- **PortfolioProject.testimonialId** links to a Testimonial; the public join must additionally
  filter both by `publish ∈ {public, featured}`.

---

## 4. Derived / computed values (do not store as source of truth)
- `Project.progress` — % of milestones `completed`.
- Portfolio filter facets (`FACETS` in reputation-data.js) — derive from the set of published
  projects, or maintain as controlled vocab (prototype uses controlled vocab).
- Testimonial **aggregate rating** and per-category averages — computed over **public** testimonials
  only (`aggregate()` in reputation-data.js).
- Health Score — computed from Assessment answers (`scores`), recomputed when reassessed.
