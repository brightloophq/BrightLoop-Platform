# 06 · Page Specs — Sales & Activation

> Covers required topic **8 (page-by-page)** for the sales/activation flow. Prototype:
> `platform/Sales.html` + `platform/sales.jsx`. This flow bridges an accepted proposal to an
> activated portal account. Access is **token/magic-link gated** (no full account until activation).
> State machines: `proposal`, `contract`, `invoice`, `payment`, `clientLifecycle` (see `03`).

Shared shell: BrightLoop brand header (logo + "secure" affordance), single centered column
(`--container-md`), step indicator showing Proposal → Contract → Payment → Activation.

---

## Proposal `/proposal/:token`
- **Purpose:** client reviews the tailored proposal and accepts or requests changes.
- **Layout:** header (client + validity date) → scope summary (modules from `Configuration`, grouped by
  discipline) → line items + subtotal + **deposit** + total → terms → action bar: **Accept** /
  **Request changes** (opens a note field) / download PDF.
- **Components:** Card, ComparisonTable/line-item list, Badge (status), Button, Modal (change request), Alert.
- **Content source:** `Proposal` (+ its `Configuration`). Amounts are **placeholder** until real pricing.
- **States & transitions:**
  - On open → `sent→viewed` (record `viewedAt`).
  - **Accept** → `viewed→accepted` (`decidedAt`) → advance to Contract.
  - **Request changes** → `viewed→change_requested` (store `changeNote`) → admin edits → `revised→sent` (v2).
  - `expired` after validity date → show expired state + "request a refreshed proposal".
  - Waiting: after a change request, show "your changes are with the team" waiting state.

## Contract `/contract/:token`
- **Purpose:** review SOW and e-sign.
- **Layout:** SOW document viewer (`sowUrl`) → signature block (typed/drawn signature + date + name) →
  legal acknowledgement checkbox → **Sign** action.
- **Components:** document viewer, Input, Checkbox, Button, Alert, Badge.
- **Content source:** `Contract` (`sowUrl`, signatures). **SOW template is placeholder — legal to supply.**
- **States & transitions:**
  - **Sign** → `sent→signed_client` (`clientSignature`, `signedAt`) → waiting state "awaiting BrightLoop
    countersignature".
  - Admin countersign → `signed_client→countersigned→active`. Only when `active` does Payment unlock and
    project kickoff become possible.
  - `voided` → show voided + "request re-issue".
  - Permission: signing requires `client_admin` (`own.contract.sign`).

## Payment `/payment/:token`
- **Purpose:** pay the deposit invoice via Stripe.
- **Layout:** invoice summary (type=deposit, amount, due) → Stripe payment element (card / ACH) →
  **Pay** → result. Trust markers (secured by Stripe). See `12-integrations` for the Stripe boundary.
- **Components:** Card, Stripe Elements mount, Button, Alert, Spinner, Progress.
- **Content source:** `Invoice` (type=deposit) + `Payment`.
- **States & transitions (payment machine):**
  - Submit → `initiated→processing` (button → loading, disabled).
  - Success → `processing→succeeded`, `invoice: →paid` → advance to Activation.
  - **Failed** → `processing→failed`: inline error with reason, **retry** + alternate method; invoice stays
    unpaid; **no activation**.
  - **3DS / ACH** → `processing→pending_3ds` (or ACH pending): "payment processing" **waiting** state;
    activation deferred until webhook confirms `succeeded`.
  - Permission: paying requires `client_admin` (`own.invoices.pay`).

## Account Activation `/activate/:token`
- **Purpose:** turn a paid `member` into an active client account and enter the portal.
- **Layout:** welcome → set password (or SSO) → optional invite team members (email + role) →
  confirm → redirect to portal `/`.
- **Components:** Input (password + strength), Button, Checkbox, team-invite rows (Input + Select role), Alert.
- **Content source:** creates/updates `User` (client_admin) + `Client`.
- **States & transitions:**
  - Requires `contract: active` **and** `payment: succeeded`; otherwise show a blocked state explaining
    what's pending (with a link back to the incomplete step).
  - On completion → `clientLifecycle: member→client_active`; create `Project` (or trigger admin to);
    send welcome notification/email.
  - Invites create `User` in `invited` status (see `07-pages-portal.md` team settings).
- **Empty/edge:** already activated → route straight to portal; expired token → request a new link.
