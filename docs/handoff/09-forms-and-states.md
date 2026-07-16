# 09 · Forms, Validation & UI States

> Covers required topics **14 (form fields & validation rules)** and **15 (empty, loading, error,
> success, waiting, disabled states)**. Reference states are visualized in `platform/StateLibrary.html`
> and `platform/EdgeStates.html`.

---

## 1. Validation principles
- Validate **on blur** for individual fields, **on submit** for the whole form; re-validate on change
  **after** a field has errored once. Never validate an untouched field.
- Show one clear message per field, below the field, in `--danger`, with the field border in danger and
  an `aria-describedby` link + `aria-invalid="true"`.
- Disable submit only while **submitting**, not while invalid — let submit surface errors (better for a11y).
  Exception: destructive/irreversible confirms may gate on a typed confirmation.
- Trim whitespace; normalize emails to lowercase; never block paste.

## 2. Field-level rules by form

**Auth — signup / login / reset**
- Email: required, RFC-valid, ≤254 chars. Password (signup/reset): required, ≥8 chars, at least one
  letter + one number; show strength meter + show/hide toggle. Login password: required only.
- Consent checkbox (signup): required (terms + privacy). Remember-me: optional.
- Errors: "Enter a valid email", "Password must be at least 8 characters", invalid-credentials =
  generic "Email or password is incorrect" (don't reveal which).

**Contact / booking**
- Name required (≤80). Email required valid. Company optional (≤120). Message required (10–2000 chars).
  Booking slot: required before confirm.

**Assessment**
- Each step's required questions must be answered to continue; scale/radio only (no free-text scoring).
  Save-and-exit allowed with partial answers (resumable).

**Configurator**
- At least one module required to produce an estimate/proposal. Owned-asset selections optional.

**Proposal change request** — note required (10–1000). **Contract** — typed/drawn signature required +
legal-acknowledgement checkbox required + name matches account.

**Payment** — delegated to Stripe Elements (card/ACH validation by Stripe); our layer validates only that
an invoice is payable and the user is `client_admin`.

**Activation** — password rules as signup; team-invite rows: email valid + role selected (rows optional).

**Deliverable revision request** — feedback note required (min 10 chars).

**Portfolio project (admin)** — name required; slug required, unique, kebab-case (auto-suggest from name);
`publish` required; result metric values numeric ≥0 and only editable when `disclosed`. `liveUrl` must be a
valid URL when `permissionLivePreview` is on. Media alt text required.

**Testimonial (admin)** — author, company, quote required; `overall` + each category 1–5.

**Team invite** — email valid + role in allowed set for the inviter's scope.

## 3. Universal UI states (apply to every data view)

| State | When | Treatment |
|---|---|---|
| **Empty** | No records yet / no results | Centered icon + heading + one-line guidance + primary action (e.g. "Create project", "Clear filters"). Never a blank screen. |
| **Loading** | Fetch in flight | Skeleton placeholders matching final layout (cards/rows), not spinners on full pages. Spinner only for inline/button-scoped waits. |
| **Error** | Fetch/action failed | Inline Alert (`--danger`) with cause + retry action; preserve user input; never lose a half-typed form. |
| **Success** | Action completed | Toast (`--z-toast`) or inline Alert (`--success`), auto-dismiss ~2.4s; update the affected row in place. |
| **Waiting** | Async pending external actor | Distinct "waiting" treatment (e.g. payment processing, awaiting countersignature, awaiting client approval) — informational, not an error; show what's being waited on + ETA/SLA if known. |
| **Disabled** | Action not permitted/available | `opacity: --opacity-disabled (0.5)`, `cursor: not-allowed`, tooltip explaining why; keep discoverable, don't hide unless role-gated. |

- **Role-gated** actions are **hidden** (not just disabled) when the user's role lacks the capability,
  and also enforced in RLS.
- **Reduced motion:** skeleton shimmer and entrance reveals respect `prefers-reduced-motion`.
- Every state above must be reachable in the built UI — acceptance criteria (`15`) test for them.

## 4. Feedback components mapping
- Field/inline validation → text + border + `aria-invalid`.
- Transient success/failure → `Toast`.
- Persistent conditions (dunning, holds, blocked activation) → `Alert` banner at top of the affected view.
- Long waits → `Progress` (determinate for uploads) or `Spinner` (indeterminate, inline).
- Empty → `EmptyState`. Loading lists → `Skeleton`.
