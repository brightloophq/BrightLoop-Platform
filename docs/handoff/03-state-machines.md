# 03 · State Machines — Valid & Prohibited Transitions

> Covers required topics **6 (state-machine specifications)** and **7 (valid & prohibited status
> transitions)**. **Canonical source:** `reference/schema.js` → `MACHINES`, plus the guards
> `can(machine, from, to)`, `nextStates(machine, from)`, `isTerminal(machine, state)`.

**Rule:** a status change is legal **only** if `to ∈ MACHINES[machine].transitions[from]`. Any move
not listed is **prohibited** — reject it at the service layer (not just the UI) and log the attempt.
Terminal states (`[]`) accept no further transitions. Cross-check every mutation with `can(...)`.

The prototypes `platform/StateLibrary.html` and `platform/EdgeStates.html` visualize these states
and the edge cases; use them as the visual reference for each status's UI treatment (badge tone via
`toneFor(status)`, banners, action cards, waiting states).

---

## 1. onboarding (assessment/funnel) — resumable
- **States:** not_started → in_progress → (abandoned) → completed
- **Legal:** `not_started→in_progress`; `in_progress→{in_progress(save-and-exit), abandoned, completed}`;
  `abandoned→in_progress` (resume via magic link); `completed→∅`
- **Prohibited:** skipping to completed from not_started; reopening completed.
- **Edge:** persist step + answers on every save; email nudge at 24h and 72h after `abandoned`.

## 2. lead
- **States:** new → qualified → proposal_sent → won | lost
- **Legal:** `new→{qualified, lost}`; `qualified→{proposal_sent, lost}`; `proposal_sent→{won, lost}`;
  `won→∅`; `lost→{qualified}` (re-open).
- **Prohibited:** `new→proposal_sent` (must qualify first); any move out of `won`.

## 3. clientLifecycle
- **States:** prospect → member → client_active → post_launch → renewed | churned
- **Legal:** `prospect→member`; `member→{client_active, churned}`; `client_active→{post_launch, churned}`;
  `post_launch→{renewed, churned}`; `renewed→{client_active, post_launch, churned}`; `churned→{member}` (win-back).
- **Prohibited:** `prospect→client_active` (must create account + pay); reactivating a churned client
  without a new membership.
- **Gate:** `member→client_active` requires `contract.active` **and** `payment.succeeded`.

## 4. proposal
- **States:** draft → sent → viewed → accepted | change_requested → revised → (sent) | expired
- **Legal:** `draft→sent`; `sent→{viewed, expired}`; `viewed→{accepted, change_requested, expired}`;
  `change_requested→revised`; `revised→sent`; `accepted→∅`; `expired→revised`.
- **Prohibited:** editing an `accepted` proposal in place — instead **clone to a new `revised` (v2)**;
  the original stays `accepted`/superseded. `draft→accepted` (must be sent + viewed).

## 5. contract
- **States:** pending → sent → signed_client → countersigned → active | voided
- **Legal:** `pending→sent`; `sent→{signed_client, voided}`; `signed_client→{countersigned, voided}`;
  `countersigned→active`; `active→∅`; `voided→sent` (re-issue).
- **Prohibited:** `active` before both signatures; project kickoff before `active`.
- **Edge:** unsigned contract blocks project kickoff; reminder cadence; the proposal stays `accepted`.

## 6. invoice
- **States:** draft → sent → pending → paid | overdue | failed → refunded
- **Legal:** `draft→sent`; `sent→{pending, paid}`; `pending→{paid, overdue, failed}`;
  `overdue→{paid, failed}`; `failed→{pending, paid}`; `paid→refunded`; `refunded→∅`.
- **Prohibited:** `paid→pending`; marking paid without a succeeded Payment.
- **Edge:** `overdue` triggers dunning — email + dashboard banner + **soft project hold** at due+7 days.

## 7. payment
- **States:** initiated → processing → succeeded | failed | pending_3ds
- **Legal:** `initiated→processing`; `processing→{succeeded, failed, pending_3ds}`;
  `pending_3ds→{succeeded, failed}`; `failed→processing` (retry); `succeeded→∅`.
- **Prohibited:** activating an account on `failed`/`pending_3ds`.
- **Edge:** `failed` → inline retry + alternate method, invoice stays unpaid, **no activation**.
  `pending_3ds`/ACH → "payment processing" **waiting** state, activation deferred until `succeeded`.

## 8. project
- **States:** created → active → {paused, delayed, in_review} → completed → post_launch
- **Legal:** `created→active`; `active→{paused, delayed, in_review}`; `paused→active`;
  `delayed→{active, in_review}`; `in_review→{active, completed}`; `completed→post_launch`; `post_launch→∅`.
- **Prohibited:** `created→completed`; leaving `post_launch`.
- **Edge:** `paused`/`delayed` → banner + revised target date + reason; timeline shows the hold.
  Multiple projects per client → project switcher; dashboard aggregates.

## 9. milestone
- **States:** pending → in_progress → waiting_client_approval → {approved, revision_requested} → completed
- **Legal:** `pending→in_progress`; `in_progress→waiting_client_approval`;
  `waiting_client_approval→{approved, revision_requested}`; `revision_requested→in_progress`;
  `approved→completed`; `completed→∅`.
- **Prohibited:** completing without client approval; skipping `waiting_client_approval`.
- **Edge:** `waiting_client_approval` → client **action card** + SLA nudge; blocks dependent work.

## 10. deliverable
- **States:** draft → submitted → in_review → {approved, revision_requested, rejected} → final
- **Legal:** `draft→submitted`; `submitted→in_review`; `in_review→{approved, revision_requested, rejected}`;
  `revision_requested→submitted`; `rejected→submitted` (new version); `approved→final`; `final→∅`.
- **Prohibited:** `final` without `approved`; editing a `final` deliverable (create a new version).
- **Edge:** revision/reject captures feedback, **bumps `version`**, reopens the upload.

## 11. fileUpload
- **States:** queued → uploading → success | failed
- **Legal:** `queued→uploading`; `uploading→{success, failed}`; `failed→queued` (retry); `success→∅`.
- **Edge:** `failed` → **per-file** retry, keep the others, show the reason (size/type/network).

## 12. automation
- **States:** active → running → {success, failed} | paused
- **Legal:** `active→{running, paused}`; `running→{success, failed}`; `success→active`;
  `failed→{active, paused}`; `paused→active`.
- **Edge:** `failed` → alert admin, surface error, retry/mute; client sees "attention needed".

---

## 13. Implementation guidance
- Put the transition guard on the server (Supabase Edge Function / RPC or your API): load current
  `status`, assert `can(machine, current, next)`, else 409 + machine name + attempted move.
- Emit a domain event on every legal transition (drives notifications, automations, analytics —
  see `12-integrations-and-analytics.md`).
- Store a per-entity **transition log** (`from, to, actor, reason?, at`) for auditability —
  required for contracts, invoices, payments, deliverable approvals.
- Map status → badge/alert tone with `toneFor(status)` so the UI never invents status colors.
