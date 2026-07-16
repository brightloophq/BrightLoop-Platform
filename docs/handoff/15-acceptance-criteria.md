# 15 · Acceptance Criteria (per major module)

> Covers required topic **29 (acceptance criteria for every major module)**. Written as verifiable
> checks. Every module must also pass the universal criteria below. `Given/When/Then` implied.

## Universal (apply to every module)
- All six UI states render where applicable: empty, loading, error, success, waiting, disabled.
- Role-gated actions are hidden for unauthorized roles **and** rejected by RLS if called directly.
- Every status change is validated by `can(machine, from, to)`; illegal transitions return an error and
  are logged; UI never offers an illegal transition.
- Keyboard-operable, visible focus, AA contrast, respects `prefers-reduced-motion`.
- Responsive at ≥1024 / 768–1023 / <768 per `04` §5 with no horizontal overflow (verified down to 320px).
- Status colors come from `toneFor(status)`; no fabricated data displayed as real.

## Public — Homepage
- Loads with SSR meta + OG; testimonials + featured case study pull from published reputation data;
  falls back gracefully if none published; all CTAs route correctly; trust bar flagged as placeholder.

## Public — Portfolio
- Only `publish ∈ {public,featured}` projects appear (verified via crafted API request → excluded).
- Multi-select facets: within-facet OR, across-facet AND; chips removable; "Clear all" resets; search
  matches name/industry/keyword/service; sort featured/recent/az; 9/page pagination; empty state on no match.

## Public — Project Case Study
- Result metrics hidden unless `disclosed && value`; otherwise honest "kept private" panel shows.
- Live-site CTAs appear only when `permissionLivePreview && liveUrl`.
- Canonical URL, meta, OG, and JSON-LD (`CreativeWork`+`Review`) emitted only for published items;
  "You may also like" excludes the current + unpublished.

## Public — Testimonials
- Aggregate + category averages computed over published reviews only; pinned first; star filter works;
  structured-data ratings reflect only real published reviews.

## Funnel — Assessment / Configurator / Recommendation / Roadmap
- Assessment resumable (save-and-exit; resume via link; 24h/72h nudges); required questions gate continue.
- Configurator: owned assets de-duplicate modules; live "from" range updates; ≥1 module to proceed; no
  horizontal overflow at 914px / split-screen.
- Recommendation + Roadmap derive from assessment+configuration; no fabricated ROI; booking creates a Meeting.

## Sales — Proposal / Contract / Payment / Activation
- Proposal: open → `sent→viewed`; Accept → `accepted`; Request changes stores note → admin `revised→sent`;
  editing an accepted proposal clones to v2; expired state shown.
- Contract: client_admin signs → `signed_client`; countersign → `active`; kickoff blocked until `active`.
- Payment: success → `succeeded` + invoice `paid`; failure → retry + no activation; 3DS/ACH → waiting;
  webhook-driven truth; never stores PAN.
- Activation: requires `contract.active` + `payment.succeeded`; sets `member→client_active`; invites create
  invited users; blocked state explains what's pending.

## Portal — Deliverables (approval loop)
- client_admin can Approve (`in_review→approved→final`) and Request revision (note required, `version` bumps,
  submission reopens); client_member can comment only; version history visible.

## Portal — Invoices, Health, Notifications, Settings
- Invoices: pay via Stripe (client_admin); overdue dunning banner; receipt on paid.
- Health score computed from real assessment (never a constant); empty before first assessment.
- Notifications deep-link via `entityRef`; unread badge accurate; mark-all-read works.
- Team settings: client_admin only; invites set `invited` status; member cannot access (hidden + RLS).

## Admin — CRM / Projects / Delivery
- Lead pipeline enforces legal stage moves; `→proposal_sent` creates Proposal; `→won` converts to Client.
- Project/milestone/deliverable transitions guarded; paused/delayed require reason + revised date.

## Admin — Finance
- Invoice + payment machines enforced; refunds `paid→refunded`; finance visible to owner/admin only.

## Admin — Reputation (Portfolio & Reviews CMS)
- Create(draft)/duplicate(draft copy)/archive(private)/publish(status)/schedule/reorder/preview all work.
- Scheduled publish flips draft→public at the set time (server-side).
- Featured-on-home toggles surface items on the homepage automatically.
- Reviews: pin, feature, moderate status; only public|featured public; a fabricated/undisclosed metric
  cannot be published.

## Admin — Media / Team / Analytics / Automation / Content
- Media upload with required alt text; signed URLs for private assets.
- Team/role changes audited; `team.*` owner-scoped.
- Analytics numbers derive from server-side events (real, not client-inferred).
- Automation list reflects n8n status; `failed` alerts admin with retry/mute.
- Content: homepage reflects feature flags with no separate content to maintain.
