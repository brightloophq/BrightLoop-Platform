# 07 · Page Specs — Client Portal

> Covers required topic **8 (page-by-page)** for the authenticated client portal. Prototype:
> `platform/Dashboard.html` + `platform/{dash-app,dash-views,dashboard-data}.js(x)`. Auth roles:
> `client_admin`, `client_member` (see `01` §3). Client-scoped data only (RLS on `clientId`).

**Shell:** left sidebar (collapsible; icon rail on tablet; drawer on mobile) + top bar (project
switcher when multiple projects, global search, notifications bell, account menu). Content on
`--bg-base`, cards `--surface-card`. Status badges use `toneFor(status)`.

---

## Dashboard Overview `/`
- **Purpose:** at-a-glance state of the engagement + next actions.
- **Layout:** greeting + project status banner → KPI row (project progress %, next milestone, open
  approvals, outstanding invoice) → **action cards** (things awaiting the client: approvals, unpaid
  invoice, unsigned doc) → recent activity/messages → health-score snippet.
- **Components:** StatCard, Progress, Badge, Alert (holds/dunning), Card, Timeline (mini), Button.
- **States:** empty (project not yet started → "kickoff pending"), paused/delayed banner with reason +
  revised date, overdue-invoice dunning banner, loading skeletons.

## Project Progress `/project`
- **Purpose:** full project timeline + status. Project switcher if `Client` has multiple `Project`s.
- **Layout:** header (name, status badge, progress bar, target date) → milestone timeline → current focus.
- **Components:** Timeline, Progress, Badge, Card. **States:** paused/delayed hold indicator; completed → post_launch view.

## Milestones `/project/milestones`
- **Purpose:** list milestones and their approval state.
- **Layout:** ordered list/board; each = title, status, due date, deliverable count, action.
- **Components:** Card, Badge, Button. **States:** `waiting_client_approval` surfaces a prominent **action card**;
  revision_requested shows notes; blocked/dependent milestones indicated.

## Deliverables `/project/deliverables` + detail `/project/deliverables/:id`
- **Purpose:** review, approve, or request revisions on work. **This is the core recurring loop (J3).**
- **List layout:** grouped by milestone; each = title, type, version, status, updated.
- **Detail layout:** preview (image/PDF/link via MediaTile), version history, feedback thread, action bar:
  **Approve** / **Request revision** (required note) / download.
- **Components:** MediaTile, Badge, Button, textarea (feedback), version list, Alert.
- **States & transitions (deliverable machine):** `in_review→approved` (client_admin) → `approved→final`;
  `in_review→revision_requested` (captures feedback, bumps `version`, reopens submission).
  `client_member` can **comment** but not approve (`own.deliverables.comment` vs `.approve`).
- **Empty:** "no deliverables yet". **Waiting:** "submitted — team is preparing the next version".

## Files `/files`
- **Purpose:** all project files/assets. **Layout:** table/grid with name, type, size, date, download;
  folders per milestone. **Components:** table/cards, Icon, Button, upload dropzone (client uploads where allowed).
- **File upload behavior:** see `10-behaviors.md` §upload (queued→uploading→success|failed, per-file retry).
- **States:** empty, uploading progress, failed with reason.

## Messages `/messages`
- **Purpose:** threaded communication with the BrightLoop team. **Layout:** thread list + conversation pane +
  composer with attachments. **Components:** thread list, message bubbles, composer, Badge (unread).
- **States:** empty ("start a conversation"), sending, attachment upload, unread counts drive notifications.

## Meetings `/meetings`
- **Purpose:** view/schedule/join meetings. **Layout:** upcoming + past; each = title, type, start, duration,
  attendees, **Join** (when `joinUrl` live). Schedule opens Booking. **Components:** Card, Button, Booking, Badge.
- **Integration:** calendar + scheduler (see `12`). **States:** none scheduled, upcoming soon (join enabled window), completed.

## Invoices & Payments `/invoices`
- **Purpose:** view/pay invoices, see history. **Layout:** list (type, amount, due, status) + detail + **Pay** (Stripe).
- **Components:** table, Badge (`toneFor`), Button, Stripe element, Alert.
- **States & transitions (invoice/payment):** pay → payment machine; overdue → dunning banner; paid → receipt;
  refunded shown. Paying requires `client_admin` (`own.invoices.pay`); `client_member` read-only.

## Business Health Score `/health`
- **Purpose:** show current score + drivers + reassess. **Layout:** score gauge + category breakdown +
  history + "reassess" CTA. **Components:** gauge/Progress, StatCard, Timeline.
- **Integrity:** score is **computed** from real Assessment answers — never a fabricated number. Empty until
  first assessment.

## Recommended Services `/recommendations`
- **Purpose:** upsell paths derived from health + engagement. **Layout:** recommended service cards with
  rationale + "add to plan" → configurator/proposal. **Components:** ServiceCard, Badge, Button.
- **Integrity:** qualitative rationale; no fabricated ROI.

## Growth Roadmap `/growth-roadmap`
- **Purpose:** forward-looking phased plan (post-launch). **Layout:** phased Timeline + per-phase deliverables +
  status. **Components:** Timeline, Card, Badge.

## Notifications `/notifications`
- **Purpose:** all alerts. **Layout:** list grouped by date; each = kind icon, title, body, deep link
  (`entityRef`), read/unread; mark-all-read. **Components:** list, Badge, Button.
- **States:** empty ("you're all caught up"), unread emphasis; bell badge in top bar reflects count.

## Account Settings `/settings/account`
- **Purpose:** profile, password, notification prefs, consent. **Components:** Input, Switch, Button, Alert.
- **Fields/validation:** see `09`. Consent toggles write `Consent` records.

## Team Settings `/settings/team` (`client_admin` only)
- **Purpose:** invite/manage client-org users + roles. **Layout:** member table (name, email, role, status) +
  invite row (email + role select) + remove. **Components:** table, Input, Select, Button, Badge.
- **States:** invited (pending acceptance), active, suspended; `client_member` cannot access this page (hide + RLS).
