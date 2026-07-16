# 08 · Page Specs — Admin Command Center

> Covers required topic **8 (page-by-page)** for the internal admin. Prototype: `platform/Admin.html`
> + `platform/{admin-app,admin-views,admin-data}.js(x)`; portfolio/reviews management is
> `platform/Reputation-CMS.html` + `reputation-cms.jsx`. Auth roles: `owner`, `admin`, `team_member`
> (capability-scoped, see `01` §3). Enforce capabilities in UI **and** RLS.

**Shell:** left sidebar grouped (Overview · Sales · Delivery · Finance · Marketing · Ops) + top bar
(global search, notifications, account). Dense data-table + detail-drawer pattern throughout.
Status badges via `toneFor(status)`. Reuse the same table/filter/pagination behavior as `10-behaviors.md`.

---

## Executive Overview `/`
- **Purpose:** business health at a glance. **Layout:** KPI row (MRR, active clients, pipeline value,
  projects in flight, overdue invoices, automations needing attention) → charts (pipeline, revenue) →
  attention queue (approvals overdue, failed payments/automations, SLA breaches) → recent activity.
- **Components:** StatCard, charts, Alert, Badge, Card, Timeline.
- **Integrity:** all figures computed from real data; **demo numbers in `admin-data.js` are placeholder.**
- **Permissions:** `owner`/`admin` full; `team_member` sees delivery-relevant subset (no finance).

## Leads & CRM `/leads`
- **Purpose:** manage pipeline. **Layout:** kanban by `lead.stage` (new/qualified/proposal_sent/won/lost)
  or table; lead detail drawer (contact, value, source, owner, activity, convert). 
- **Transitions (lead machine):** enforce legal moves; `→proposal_sent` builds a Proposal; `→won` converts to Client.
- **Components:** board/table, Badge, Button, drawer, Input/Select. **States:** empty stage, drag-to-move, filters.

## Clients `/clients` + `/clients/:id`
- **Purpose:** manage client orgs. **Layout:** list (company, plan, MRR, lifecycle, health, AM) → detail
  (overview, projects, invoices, contacts/seats, activity, health). **Components:** table, StatCard, Badge, tabs.
- **Permissions:** `team_member` read-only; finance fields `owner`/`admin` only.

## Projects `/projects` + `/projects/:id`
- **Purpose:** run delivery. **Layout:** list (client, name, status, progress, manager, target) → detail
  (milestones, deliverables, files, messages, team). **Transitions (project machine):** paused/delayed require reason + revised date.
- **Components:** table, Progress, Timeline, Badge, Button.

## Milestones `/milestones` (cross-project)
- **Purpose:** oversee milestone states across projects. **Layout:** filterable table; bulk status view;
  `waiting_client_approval` and overdue highlighted. **Transitions:** milestone machine.

## Deliverables `/deliverables` (review queue)
- **Purpose:** submit work for client approval; track versions. **Layout:** queue grouped by status;
  detail with upload + version history. **Transitions:** deliverable machine (`draft→submitted→in_review→…`).
- **Components:** MediaTile, table, Badge, upload, Button.

## Messages `/messages`
- **Purpose:** all client threads. **Layout:** thread list (filter by client) + conversation + composer.
- **States:** unread counts, assignment (confirm — open decision).

## Proposals `/proposals` + `/proposals/:id`
- **Purpose:** build, send, revise proposals. **Layout:** list (client, total, status, sent/viewed) →
  builder (line items from Configuration, deposit, terms) → send. **Transitions:** proposal machine;
  edit-after-accept clones to v2 `revised`. **Components:** line-item editor, Badge, Button, Modal.

## Contracts `/contracts` + `/contracts/:id`
- **Purpose:** issue + countersign SOWs. **Layout:** list (client, status, signed dates) → viewer +
  countersign action. **Transitions:** contract machine (`signed_client→countersigned→active`).

## Invoices & Payments `/invoices`
- **Purpose:** issue invoices, track payments, run dunning. **Layout:** list (client, type, amount, due,
  status) → detail (payments, retries, refund). **Transitions:** invoice + payment machines; overdue → dunning.
- **Permissions:** `finance.*` = `owner`/`admin` only.

## Portfolio & Case-Study Management `/portfolio`  (Reputation CMS → Projects)
- **Purpose:** CRUD + publish portfolio. **Prototype: `reputation-cms.jsx` Projects tab.**
- **Layout:** toolbar (search, status filter, **New project**) → table (reorder ↑↓, name+slug, industry,
  **status select**, **featured-on-home toggle**, actions: upload media / schedule / duplicate / archive / preview).
- **Actions:** create (draft), duplicate (→ draft copy), archive (→ private), publish/unpublish (status select),
  schedule publication, upload media, reorder (manual), preview (opens public detail).
- **Integrity:** result metrics editable only via `metrics.disclosed=true` + real values; publish gating
  in `10-behaviors.md` §moderation. **States:** empty, scheduled indicator, featured row tint.

## Testimonial & Review Moderation `/reviews`  (Reputation CMS → Reviews)
- **Purpose:** moderate, pin, feature reviews. **Prototype: `reputation-cms.jsx` Reviews tab.**
- **Layout:** review rows (stars, author, company, publish chip, quote) + controls: **pin**, **feature-on-home**,
  **status select** (draft/private/public/featured). **Rule:** only public|featured appear publicly.

## Media Library `/media`
- **Purpose:** central asset store (images, video refs, PDFs) for portfolio/case studies/content.
- **Layout:** grid with filters (type, project, date), upload, detail (usage, alt text, credit).
- **Integration:** Supabase Storage (see `12`). **States:** empty, uploading, failed; **alt text required** (a11y).

## Team & Permissions `/team`
- **Purpose:** manage internal users + roles. **Layout:** member table (name, email, role, status, last active) +
  invite + role change + suspend. **Permissions:** `owner` (and `admin` limited) — `team.*`. Role changes audited.

## Analytics `/analytics`
- **Purpose:** funnel + engagement + delivery metrics. **Layout:** dashboards (acquisition funnel,
  assessment→proposal→won conversion, portfolio engagement, project throughput). **Source:** analytics events (`12` §25).
- **Integrity:** real data only; no placeholder KPIs shipped as if real.

## Automation Monitoring `/automation`
- **Purpose:** watch n8n workflows. **Layout:** list (name, provider, trigger, status, runs, lastRun, lastError) +
  detail (run log). **Transitions:** automation machine; `failed` alerts admin, retry/mute. **States:** attention-needed emphasis.

## Content Publishing `/content`
- **Purpose:** manage homepage feature flags + marketing pages. **Prototype: `reputation-cms.jsx` Homepage tab.**
- **Layout:** shows what is `featuredOnHome` (projects + reviews auto-surface) + page publish controls.
- **Rule:** homepage pulls from feature flags automatically — no separate content to maintain.
