# Engineering Principles

Status: Draft
Owner: Auxion Engineering
Last updated: 2026-07-17

> This chapter defines the **permanent engineering laws** for evolving the existing platform into Auxion.
> It uses the Engineering Discovery Report as factual ground truth and the Product Bible as the authority on
> product behavior. It is implementation-aware but not bound to any single vendor. When an engineering law
> here changes, this chapter changes first (see the change policy in `README.md`).

---

## Purpose

Auxion is an **evolution of an existing secure, modular platform — not a greenfield rewrite.** The
Discovery Report established that the current system (the `brightloop-frozen-v1` baseline) is
production-grade for agency and client-delivery workflows: authentication, authorization, Row Level
Security, guarded state transitions, a design system, CI, and deployment all work and are strong.

The objective of the engineering effort is therefore precise: **preserve the proven foundations while
introducing the transformation domain, AI, automation, and observability deliberately.** We are adding four
new load-bearing systems onto a sound substrate — not demolishing the substrate. Every principle in this
chapter serves that objective: protect what works, add what is missing through defined seams, and make each
addition safe, reversible, observable, and traceable to the Product Bible.

This is a discipline of restraint as much as construction. The failure modes we are guarding against are
(a) rewriting working systems for no measurable benefit, and (b) bolting on AI and automation without the
isolation, accountability, and visibility that make them trustworthy. Both failures are avoidable, and this
chapter defines how.

---

## Engineering Position

The current position, stated factually:

- **The existing platform is production-grade for agency and client-delivery workflows.** It runs live,
  passes a full quality gate, and enforces its guarantees structurally.
- **The following are reusable and are preserved:** Supabase authentication (PKCE, SSR sessions, JWT role
  claims via the access-token hook); the capability-based authorization model; Row Level Security (34
  tables, 89 policies) and tenant isolation; the conversations/collaboration subsystem; client-scoped
  access; guarded, audited state transitions (`performTransition` + DB triggers); the domain and data
  package boundaries; the `@brightloop/ui` design system and tokens; and the CI + Vercel deployment
  pipeline.
- **The following are not yet implemented and must be designed and built:** the transformation-cycle
  domain (Signal, Insight, Recommendation, Move, Measurement, Learning, Business Health, Transformation
  Index, Operational Risk, Knowledge Asset); the AI Auxiliary architecture (provider abstraction, prompt
  and context management, memory, retrieval); the automation/orchestration runtime (queue, workers,
  scheduler, outbound triggers, retries); and advanced observability (tracing, metrics, health, structured
  logging, AI/automation monitoring).
- **Therefore the implementation strategy must be additive, migration-safe, and evidence-driven.** New
  capability enters through seams without disturbing working systems; schema and behavior evolve through
  reversible, compatibility-aware steps; and decisions are grounded in the Discovery Report and the Product
  Bible rather than in assumption.

---

## Foundational Doctrine

The doctrines below are the reasoning framework beneath every engineering decision in the Auxion evolution.

### Preserve Proven Foundations
Do not rewrite working **authentication, authorization, tenant isolation, design tokens, CI, or domain
seams** without a demonstrated requirement. These are the parts the Discovery Report scored 8–9/10; they are
assets, and rewriting them spends trust and time for no gain. A rewrite of a proven foundation requires a
stated, measurable justification — a capability the current design provably cannot support — not a
preference. The default answer to "should we replace this working system?" is no.

### Extend Through Seams
New capabilities enter the platform through its existing extension points: **packages, service contracts,
provider abstractions, events, migrations, and guarded state transitions.** The AI layer arrives as a
package with a provider interface; automation arrives behind an owned runtime contract; new domain concepts
arrive as additive migrations and domain services. A capability that cannot be expressed through a seam is a
signal to design the seam first — never to reach around the architecture.

### No Big-Bang Rewrite
Auxion evolves **incrementally, through vertical slices and reversible migrations.** No milestone depends on
a simultaneous, irreversible cutover of many systems. Each increment delivers a thin, complete, usable path
and can be reversed if it misbehaves. Large, coupled, all-or-nothing changes are prohibited because they are
unverifiable and unrecoverable at the scale Auxion operates.

### Product Bible Alignment
Every major technical capability is **traceable to a Product Bible concept.** A domain entity maps to a
canonical entity; an AI behavior maps to the Auxiliary contract; an automation maps to Orchestration. If a
proposed capability has no home in the Product Bible, either it does not belong, or the Product Bible must be
amended first. Engineering does not invent product; it constructs the product the Bible defines.

### Human Authority in Code
The **Human + AI contract is enforced technically, not merely described in prompts or UI copy.** "AI proposes;
humans decide" must be a property of the data model and the authorization layer: AI outputs are recommendations,
consequential actions require an explicit human approval record, and no code path lets AI cross an approval
gate. A contract that lives only in a prompt or a label is not enforced — it is hoped for.

### Provider Independence
**AI, automation, email, payments, and every other external service are accessed through owned interfaces and
adapters.** The platform depends on *its own contract*, never on a vendor's SDK shape. This already holds for
payments/e-sign/email/automation (adapter ports with mock implementations); it must hold for AI models and
orchestration engines too. Provider independence is what lets Auxion adopt the best service of any era — and
survive any one of them failing or changing.

### Tenant Isolation by Construction
**Organization and client isolation is enforced at the database and authorization layers**, not in the
interface. RLS scopes rows to `auth.client_id`; role and scope govern access at the service layer. New
systems — AI context retrieval, automation runs, observability — inherit these boundaries by construction: an
AI query, an automation job, and a log record are all scoped exactly as a user request is. Isolation that
depends on application code remembering to filter is not isolation.

### Observable Before Scalable
**No AI or automation capability is production-ready without logging, metrics, auditability, and failure
visibility.** The Discovery Report found observability absent; for AI and automation — systems that act at
scale and can fail silently — that gap is disqualifying. A capability we cannot see is a capability we cannot
trust, tune, or operate. Observability is part of a foundation's definition of done, not a later addition.

### Durable Asynchronous Work
**Long-running, retryable, scheduled, or externally dependent work does not rely only on synchronous request
handling.** AI generation, automation runs, external callbacks, and scheduled measurement are inherently
asynchronous; the platform currently has no durable runtime for them. Such work executes on a durable
substrate (queue/worker/scheduler) with persisted state, so a request timeout, a deploy, or a crash does not
lose or corrupt it.

### Explicit State Transitions
**Material lifecycle changes pass through validated and audited transitions.** This is already the platform's
strongest pattern (`performTransition` + state machines + DB triggers), and it extends to every new lifecycle:
a Move's status, an automation run's status, a risk's treatment, an AI recommendation's disposition. Status is
never mutated by a bare write; it moves along a defined, guarded, recorded path.

### Evidence Before Intelligence
**AI recommendations identify their evidence, uncertainty, context, and provenance.** An Auxiliary output is
not a bare answer; it carries the inputs it reasoned from, a calibrated confidence, the context scope it used,
and which model and prompt produced it. This makes AI inspectable, auditable, and safe to act on — and it is a
precondition for the Bible's "evidence before assertion" doctrine to be real rather than aspirational.

### Idempotency by Default
**Webhooks, jobs, automation runs, and AI-triggered actions tolerate retries safely.** Networks retry,
workers restart, and callbacks arrive twice; any operation that could repeat is designed so repetition is a
no-op or safely converges. The existing HMAC webhooks establish the pattern; every new asynchronous operation
follows it. Non-idempotent side effects are a defect, not an edge case.

### Security as an Architectural Property
**Security exists across identity, authorization, database access, secrets, integrations, AI context, and
audit** — not in one module. Every new surface inherits the platform's posture: AI context respects RLS,
automation respects capabilities, secrets never reach the client, integrations verify signatures, and
consequential actions are audited. Security is a property of the whole architecture, continuously, or it is
not present.

### Evolutionary Data Design
**Transformation entities are introduced through additive migrations and compatibility-aware changes.** New
tables and columns are added without breaking existing readers; destructive changes are staged (add → migrate
→ retire) and reversible or paired with a documented recovery plan. The database evolves forward under a live
system; it is never rebuilt in place.

### Tests Follow Risk
**Testing depth reflects the business, security, automation, and AI risk of the capability.** Authorization,
tenant isolation, financial transitions, and AI-influenced consequential paths get the deepest verification
(including live-DB and end-to-end coverage the platform currently lacks); low-risk presentation gets less.
Coverage is a means to confidence proportional to risk, not a uniform quota.

---

## Architectural Boundaries

These are responsibilities, not a folder tree. Package names are indicative; future package names are **not
finalized here.**

- **`packages/schema`** — the source of truth for **contracts**: entity shapes (validated), state machines,
  the role/permission matrix, and canonical enums. Framework-agnostic; no I/O. New transformation entities and
  the Auxiliary/automation contracts are declared here first, in canonical Product Bible terminology.
- **`packages/domain`** — the **pure service and logic layer**: guards (`assertTransition`, `assertCapability`),
  transition records, funnel/pricing/reputation logic, and the ports for external providers. The Human + AI
  contract, risk-treatment rules, and transformation-cycle logic live here as pure, testable functions. No
  Next, no database driver.
- **`packages/data`** — the **persistence seam**: repository ports and their Supabase/placeholder
  implementations, mappers, and the request-scoped client binding. All database access for new domains flows
  through here; nothing above it talks to the database directly.
- **`packages/db`** — the **schema of record**: migrations (the true source of truth) and generated types.
  Owns the physical database evolution, RLS policies, functions, and triggers. Transformation and
  AI/automation persistence enter through additive migrations here.
- **`packages/ui`** — the **visual design system**: tokens and presentation components. It renders state; it
  holds no business logic, no authorization, and no AI/automation concerns.
- **`apps/web`** — the **composition and delivery surface**: routing, Server Components, Server Actions, route
  handlers, middleware, and the wiring of the packages. It orchestrates the layers; it is not where core logic
  or persistence lives.

Likely **future boundaries** (responsibilities defined, names deferred to Chapter 01/03/04/05):

- **AI** — an owned boundary responsible for the **Auxiliary**: a provider-independent model interface,
  prompt/version management, context assembly (scoped by tenant and authorization), retrieval/knowledge access,
  memory, and the enforcement in code of the non-decision contract. It produces **Recommendations with evidence,
  confidence, and provenance**; it never writes consequential state or crosses an approval gate.
- **Automation** — an owned boundary responsible for the **Orchestration runtime**: durable job execution
  (queue/worker/scheduler), an outbound-trigger contract, run identity and status, retries/dead-letter/idempotency,
  and human-approval gating. It executes approved work; it holds no consequential decision authority.
- **Observability** — a cross-cutting boundary responsible for **tracing, metrics, health, structured logging,
  and audit surfacing**, including AI and automation monitoring. It observes every layer without leaking
  sensitive client or AI context (see invariants).

These future boundaries attach to the existing seams; they do not replace the current packages.

---

## Non-Negotiable Invariants

These hold across every Auxion capability. A design that violates one is rejected, or this chapter is changed
deliberately, in the open.

1. **AI cannot independently approve, commit, execute, or override material decisions.** Every consequential
   action requires an explicit human approval; no code path lets an Auxiliary cross an approval gate.
2. **AI cannot bypass domain services or RLS.** The Auxiliary reads and acts only through the same authorized,
   RLS-scoped, guarded seams as any actor; it has no privileged back door to data or state.
3. **Every material AI output is attributable** to a model identifier, a prompt/version, an evidence set, a
   context scope, and a timestamp — persisted, not ephemeral.
4. **Every automation execution has a durable run identity and status.** No automated work runs anonymously or
   without a recorded, queryable lifecycle state.
5. **External callbacks are authenticated and idempotent.** Every inbound webhook verifies its signature over
   the raw body and tolerates duplicate delivery safely.
6. **Tenant data never crosses an organization boundary** — not through the UI, the API, automation, AI
   retrieval, or observability. Isolation is enforced at the database and authorization layers.
7. **State changes are authorized and auditable.** Material lifecycle changes pass a capability check and a
   guarded transition, and leave an immutable audit record naming the responsible actor.
8. **Failed asynchronous operations remain visible and recoverable.** No job, run, or callback fails silently;
   failures surface, persist, and can be retried or dead-lettered.
9. **Production behavior does not depend on mock providers.** A capability is not production-ready while it
   relies on a mock; real providers are configured and verified before the capability is trusted.
10. **Secrets are never exposed to client bundles.** Service-role keys, provider secrets, and signing keys are
    server-only; only explicitly public (`NEXT_PUBLIC_*`) values reach the browser.
11. **Database migrations are reversible or carry a documented recovery plan.** No irreversible schema change
    ships without a stated, tested path back or forward-recovery.
12. **Existing stable capabilities are not replaced without measurable benefit.** Replacing a working
    foundation requires a demonstrated requirement and a stated benefit, recorded as a decision.
13. **Transformation entities use canonical Product Bible terminology.** Signal, Insight, Move, Recommendation,
    Approval, Business Health, Transformation Index, Operational Risk, Knowledge Asset mean exactly what the
    Bible says, in schema, code, and API.
14. **Human approvals are stored as explicit records** — who approved, what, and when — not inferred from a
    status field or a UI action. The approval is first-class data.
15. **Observability data does not leak sensitive client or AI context.** Logs, traces, and metrics carry
    identifiers and metadata, not raw client content, secrets, or full AI context/prompts containing sensitive
    data.
16. **Every consequential action is attributable to a responsible identity** — human or service — at the point
    it happens. No anonymous consequential action exists in the system.
17. **AI-influenced actions record the recommendation they acted on.** When a human acts on an Auxiliary
    recommendation, the linkage (recommendation → decision → action) is persisted, so AI influence on outcomes
    is auditable.
18. **Authorization is decided at the point of action**, from verified identity and scope — never trusted from
    the client or inferred from what an interface happens to show.
19. **Uncertainty is represented, never hidden.** AI outputs carry calibrated confidence; a system that
    presents an estimate as certainty is non-conformant.
20. **No foundation is "done" without its failure behavior defined.** A capability whose behavior under
    failure is unspecified is incomplete, regardless of its happy-path completeness.

---

## Decision Framework

Any material engineering decision is evaluated against all ten criteria. A decision is not ready until each is
answered honestly.

1. **Product Bible alignment** — does it trace to a Product Bible concept, and honor its contracts?
2. **Current architecture compatibility** — does it attach at an existing seam without disturbing proven
   systems?
3. **Security and tenant isolation** — does it preserve identity, authorization, RLS, and cross-tenant
   isolation by construction?
4. **Reversibility** — can it be undone or rolled forward safely if it misbehaves?
5. **Operational complexity** — what does it cost to run, monitor, and support over time?
6. **Observability** — can its behavior, health, and failures be seen in production?
7. **Testability** — can its correctness be verified at a level proportional to its risk?
8. **Provider lock-in** — does it keep the platform dependent on an owned contract rather than a vendor's
   shape?
9. **Long-term maintainability** — will a future contributor understand and safely evolve it?
10. **User and business value** — does it help a business decide or execute better (the Core Promise), and is
    that worth the cost?

**The most sophisticated solution is not automatically the best solution.** A simpler design that scores well
across these criteria beats a clever one that wins on capability but loses on reversibility, observability, or
maintainability. Sophistication is justified only when the simpler alternative provably cannot meet the need.

---

## Build Versus Buy

For any capability, choose the sourcing strategy deliberately:

- **Build internally** when the capability is a **strategic differentiator** (the transformation cycle, the
  Auxiliary's contract and orchestration of intelligence, the domain logic), when owning it is required for
  **security or tenant isolation**, or when no external option fits the Product Bible's contracts. Auxion's
  identity is built, not bought.
- **Adopt an open-source component** when a well-understood, well-maintained library solves a non-differentiating
  problem (a queue, a validation library, a tracing SDK), the operational burden is acceptable, and it can sit
  behind an owned interface to preserve portability.
- **Use a managed service** when the operational burden of self-hosting outweighs the cost (managed Postgres,
  auth, object storage — as with Supabase today), the security and compliance posture is acceptable, and the
  dependency is accessed through an owned abstraction so it remains replaceable.
- **Integrate an external platform** when a mature vendor owns a complex, non-differentiating domain (payments,
  e-signature, an automation engine, model providers), always **behind an adapter** so the platform depends on
  its own contract, not the vendor's.

Every sourcing decision weighs: **strategic differentiation, security, operational burden, cost, maturity,
portability, compliance, and failure modes** — especially failure modes: how the capability behaves when the
external dependency is slow, down, changed, or compromised. A dependency without a considered failure mode is
an unacceptable dependency.

---

## Technical Debt

Debt is managed, not moralized:

- **Intentional debt** — a conscious, recorded trade taken to learn or deliver faster, whose cost is understood
  and whose payoff justifies it. Legitimate, under discipline.
- **Accidental debt** — the unrecorded accretion of shortcuts, unclear code, and unmanaged complexity that no
  one chose. To be prevented and paid down when found.
- **Unacceptable debt** — trades that compromise a foundation others depend on, weaken security or
  accountability, or hide failure. Explicitly: **missing observability, missing authorization, and hidden
  failure handling cannot be classified as acceptable shortcuts.** They are defects, not debt, and do not ship.
- **Documentation requirements** — every intentional debt is recorded: what was traded, why, its cost, and the
  condition for repaying it. Untracked debt is the dangerous kind.
- **Ownership** — every debt has a named owner accountable for tracking and retiring it. No ownerless debt.
- **Retirement conditions** — debt is scheduled for repayment, prioritized by the cost and risk it imposes, and
  retired before it forces a rewrite. Debt in the core, security, or domain integrity is retired first.

---

## Definition of Foundation Ready

A new foundation (transformation domain, AI, automation, observability) is ready for **feature
implementation** only when **all** of the following are true:

- **Architecture and boundaries are documented** — its responsibilities and seams are defined.
- **Schema or contracts are versioned** — its data shapes and interfaces are declared and stable.
- **The security model is defined** — identity, authorization, RLS/tenant scope, and secret handling are
  specified.
- **Failure behavior is defined** — what happens on error, timeout, retry, and partial failure is specified.
- **Observability is defined** — the logs, metrics, traces, and audit it emits are specified and in place.
- **Tests exist at the appropriate level** — verification proportional to the foundation's risk, including
  live-DB/E2E where the risk warrants.
- **Migration impact is understood** — the additive, compatibility-aware, reversible path is planned.
- **Operational ownership is clear** — a named owner is accountable for running and supporting it.
- **Rollback or recovery is documented** — a tested path back or forward exists.
- **Product Bible alignment is verified** — every capability it exposes traces to a Bible concept and honors
  its contracts.

A foundation missing any of these is *in progress*, not ready — and feature code is not built on it until it is.

---

## Engineering Principles

The permanent, review-ready laws. Use them in code review and architecture review.

1. **Preserve what is proven; replace only what is justified.**
2. **Add through seams; never reach around the architecture.**
3. **Evolve in reversible slices; never bet the platform on a big-bang cutover.**
4. **Every capability traces to the Product Bible, or it does not ship.**
5. **Human authority lives in the data model, not only the interface.**
6. **AI proposes; the system never lets it decide.**
7. **Depend on your own contracts, not a vendor's shape.**
8. **Tenant isolation is enforced by construction, not by remembering to filter.**
9. **An invisible failure is an architectural failure.**
10. **If it can be retried, it must be safe to retry.**
11. **Long-running work belongs on a durable substrate, not a request thread.**
12. **Material state moves only through guarded, audited transitions.**
13. **No AI output without evidence, uncertainty, and provenance.**
14. **Attributability is not optional: every consequential action names a responsible identity.**
15. **Secrets are server-only, always; the client bundle is untrusted.**
16. **Security is a property of the whole system, checked everywhere, continuously.**
17. **The database evolves forward additively; it is never rebuilt in place under a live system.**
18. **Test in proportion to risk; the riskiest paths get the deepest verification.**
19. **The simplest design that meets the criteria wins; sophistication must be earned.**
20. **A foundation is not done until its failure behavior, observability, and recovery are done.**
21. **Missing observability, authorization, or failure handling is a defect, never a shortcut.**
22. **Canonical terminology in code: the Bible's words mean the Bible's things, everywhere.**
