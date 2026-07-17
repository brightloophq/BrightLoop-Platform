# 06 · User Personas

Status: Draft
Owner: Auxion Product Team
Last updated: 2026-07-17

Purpose:
Describes the archetypal users Auxion serves, their goals, and their contexts.

---

> This chapter is the canonical reference for **who Auxion is for**. It defines every primary user —
> who they are, why they use Auxion, what success means to them, what they may do, and how the product
> should serve them. It guides UX, the permission model, feature prioritization, onboarding, and
> Auxiliary behavior. Roles referenced here use the canonical role families from `03-product-dna.md`
> and are governed in detail by `12-security-and-permissions.md`. When personas change, this chapter
> changes first (see the prime rule in `README.md`).

---

## Introduction

Auxion is designed around **people and their responsibilities**, not around software roles. A "role"
in most systems is a bundle of screen access; a persona in Auxion is a person with goals, judgment,
and accountability. We design for the human first — what they are trying to accomplish and what they
are answerable for — and derive the interface and permissions from that, rather than starting with a
permission matrix and hoping a usable product falls out.

This is why **permissions exist to support operational accountability, not hierarchy.** A permission is
not a rank or a reward; it is the pairing of an ability with the responsibility for how it is used.
Someone can approve a move because they are accountable for that move's consequences — not because they
sit high on an org chart. The result is a system where authority is legible: every consequential
action traces to a person who was responsible for it, and no one holds power they are not answerable
for. Personas are how we keep that human accountability at the center of every design and permission
decision.

Two families of users run through everything below: the **Auxion team** (internal — Strategists,
operators, administrators) and the **client organization** (the customer's own people — owners and
team members). Each persona is labeled with its side.

---

## Persona 1 — Business Owner

*Side: Client organization · Role family: client decision-maker (`client_admin`)*

- **Purpose.** The Business Owner is the principal of the customer's business — the person ultimately
  accountable for its results and the one Auxion is transforming the business *for*.
- **Goals.** Grow the business, fix what is holding it back, and gain confidence that the right things
  are being done. They want outcomes, not activity.
- **Daily concerns.** Revenue, cost, customers, the health of operations, and whether the current
  investments are paying off. Their attention is scarce and pulled in many directions.
- **Success metrics.** Measurable business improvement — better margins, faster delivery, steadier
  operations — and a clear sense that the transformation is progressing.
- **Pain points.** Too many disconnected tools and reports; not enough time to interpret them; low
  confidence about which move matters most; fatigue from decisions made without evidence.
- **Decision-making style.** Time-pressured and outcome-oriented. They decide quickly when the
  evidence and the recommendation are clear, and they distrust anything that feels like hype or busywork.
- **How Auxion helps.** It gives them a calm, honest picture of Business Health and the Transformation
  Index, surfaces the highest-impact moves with the reasoning attached, and lets them approve
  consequential decisions in moments rather than meetings.
- **Permissions.** Full decision authority over their own organization: view their Business Health and
  progress, participate in Conversations, and grant the Approvals that require the client's
  authorization (proposals, contracts, key deliverables). Scoped strictly to their own business; no
  visibility into other clients or internal operations.
- **Typical workflow.** Open the Dashboard → see what needs attention → review a recommended move with
  its evidence → discuss with the Strategist in Conversation if needed → approve → watch progress and
  measured results over time.
- **Relationship with the Auxiliary (AI).** They receive its recommendations and reasoning but are
  never managed by it. The Auxiliary informs their decision; it never makes it. They should always
  feel that a person, aided by good analysis, is in charge — themselves.
- **Relationship with the Strategist.** This is their trusted partner. The Strategist brings
  expertise, frames the decisions, and owns the relationship. The Business Owner leans on the
  Strategist for judgment and accountability, and the product makes that human partnership visible and
  reachable.

---

## Persona 2 — Operations Manager

*Side: Auxion team · Role family: operational executor (`team_member`)*

The Operations Manager is the person who turns approved strategy into running work — the operational
executor of transformation, distinct from the Strategist (who owns strategy and the client
relationship) and the Business Owner (the client's principal).

- **Responsibilities.** Drive the day-to-day execution of transformation: triage signals, shape and
  progress moves, configure and monitor orchestrations, and keep delivery on track across the clients
  they support.
- **Operational priorities.** Throughput and reliability — getting approved moves executed on time,
  keeping work flowing through its stages, and catching problems before they become failures.
- **KPIs.** Execution throughput, on-time delivery, cycle time from approval to completion,
  orchestration health (failed vs. successful runs), and the share of moves that reach measured
  outcomes.
- **Pain points.** Work that stalls between stages; unclear ownership; manual coordination overhead;
  losing the thread of why a move was made; and firefighting that crowds out steady improvement.
- **How they use Signals.** As their inbound queue — reviewing detected changes, prioritizing them,
  and routing the ones that warrant a move.
- **How they use Moves.** As their primary unit of work — forming moves from recommendations, sequencing
  them, and driving them through execution.
- **How they use Orchestrations.** To automate the mechanical progression of work — configuring the
  automated steps, monitoring runs, and intervening when an orchestration fails.
- **How they use Approvals.** They *prepare* and *route* work for approval and execute what has been
  authorized. Consequential sales and financial authorizations are **not** theirs to grant — those
  route to the Strategist (see Permissions).
- **How they use Reporting.** To monitor operational state and progress, spot bottlenecks, and
  communicate delivery status upward and to Strategists.
- **Permissions.** Broad operational capability within delivery — signals, moves, orchestrations,
  projects, deliverables — but **deliberately excluded from sales and finance authority** (sending
  proposals, countersigning contracts, issuing invoices). That boundary is a core accountability line:
  the operator runs the work; the Strategist owns the commercial decisions. Internal scope across the
  clients they are assigned; no client-billing authority.

---

## Persona 3 — Auxion Strategist

*Side: Auxion team · Role family: strategic owner (`owner` / `admin`)*

- **Purpose.** The Strategist is the accountable human partner for a client's transformation — the
  holder of judgment, authority, and the relationship. They are the human half of the Human + AI
  partnership defined in `02-product-philosophy.md`.
- **Responsibilities.** Own the strategy for each client, decide and approve consequential moves, guide
  the transformation over time, and carry the commercial relationship (proposals, contracts, pricing).
- **How they collaborate with clients.** Through the Conversation Workspace and Meetings — bringing
  evidence, framing options, and building the trust that lets a client act with confidence. They are
  the client's primary point of contact.
- **How they use Conversations.** As the shared record of the relationship and the place decisions are
  discussed and agreed. They add internal notes their clients never see, and they keep the client-facing
  thread clear and honest.
- **How they generate proposals.** By turning a client's diagnosed needs and configured plan into a
  concrete offer — building quotes and proposals, exercising the pricing authority that operators lack,
  and sending them for the client's approval.
- **How they review recommendations.** They are the human check on the Auxiliary — reviewing its
  recommendations, weighing the evidence and confidence, accepting, adjusting, or rejecting them, and
  converting the ones they endorse into moves. The Auxiliary proposes; the Strategist disposes.
- **How they guide transformation.** By reading Business Health and the Transformation Index, choosing
  the sequence of moves that will compound, and steering the client through the transformation cycle
  over the long arc of the relationship.
- **Permissions.** Full internal authority: approve consequential moves, own client relationships, and
  hold the sales and finance capabilities (proposals, contracts, invoicing) that operators are excluded
  from. Their authority is broad because their accountability is total — the record shows them as the
  responsible party for the decisions they make.

---

## Persona 4 — Client

*Side: Client organization · Role family: client team member (`client_member`)*

The Client persona is a member of the customer's organization other than the principal — a team member
who participates in the transformation without holding the owner's full authority.

- **Goals.** Understand what Auxion is doing for their business, contribute where their input is needed,
  and stay informed about progress.
- **Expectations.** A clear, calm, trustworthy window into their transformation — no operational
  machinery, no jargon, no surprises.
- **What they should see.** Their business's Transformation Progress, the Conversation with the Auxion
  team, the Deliverables being produced, the Files relevant to them, the Approvals assigned to them,
  and their Billing.
- **What they should not see.** The internal operational apparatus (signal triage, orchestration
  configuration, cross-client tooling), any other client's data, internal strategist notes, and
  internal-only pricing or estimates. The client experience is intentionally scoped to their own
  business and their own altitude.
- **Deliverables.** They review what is produced for them and provide sign-off where their approval is
  required, with the evidence and reasoning presented to decide well.
- **Conversation.** Their direct line to the Auxion team — the human channel for questions, context,
  and agreement.
- **Approvals.** The decisions assigned to them, presented plainly with the "why" attached. They act
  within the authority their organization has granted them.
- **Files.** The shared artifacts scoped to what they should see.
- **Transformation Progress.** The client-facing view of the Transformation Index and Stage — how far
  the business has come and what is underway.
- **Billing.** The commercial relationship — proposals, contracts, invoices, payment — presented
  clearly.
- **Relationship with the Strategist.** Their point of contact and trusted guide, visible and reachable
  in the Portal.
- **Relationship with the Auxiliary (AI).** They experience its value indirectly, through the clarity
  of recommendations and progress, but they are never handed raw AI output as authority. A person — the
  Strategist — always stands between them and the machine.
- **Permissions.** View and participate within their own organization's scope only; act on the Approvals
  assigned to them. Strictly bounded to their client, with less authority than the Business Owner
  (`client_admin`). RLS enforces this scope at the data layer.

---

## Persona 5 — Platform Administrator

*Side: Auxion team · Role family: platform governance (`owner` / `admin`)*

- **Platform management.** Keeps Auxion itself healthy and correctly configured — the person
  responsible for the operating system as a system, distinct from the Strategist who is responsible for
  client outcomes.
- **Security.** Owns the security posture: enforcing least privilege, managing the boundaries between
  internal and client access, and ensuring the protections defined in `12-security-and-permissions.md`
  hold in practice.
- **Configuration.** Manages platform-level settings, integrations, provider configuration (payments,
  e-sign, automation, email), and the environment the whole team depends on.
- **Monitoring.** Watches the health of the platform and its integrations — automation runs, webhook
  health, system state — and responds when something degrades.
- **Auditing.** Reviews the audit trail — who did what, who approved what — to ensure accountability is
  real and to support any compliance obligations.
- **User management.** Provisions and deprovisions users, assigns roles, and ensures each person holds
  exactly the authority their responsibility requires — no more.
- **Permissions.** The broadest platform authority, but scoped to *governance* rather than client
  decisions. Administrators configure and safeguard the system; they do not substitute their judgment
  for a Strategist's on a client's transformation. Every administrative action is itself auditable —
  there is no authority in Auxion that escapes the record.

---

## Future Personas

The architecture is built so new kinds of users can be added without restructuring the product,
because personas are expressed as **responsibility + scope + capability**, and the permission model is
context-based rather than a fixed hierarchy (see `05-information-architecture.md` on scaling through
seams). Anticipated future personas:

- **Enterprise Executive.** A senior leader in a larger client organization needing a portfolio view
  across multiple business units. Fits as a client-side persona with broadened scope over a hierarchy
  of entities.
- **Department Lead.** A client-side manager accountable for one function's transformation. Fits as a
  scoped client role with authority over a subset of their organization's work.
- **Partner Consultant.** An external expert who collaborates alongside Auxion Strategists on specific
  engagements. Fits as an internal-adjacent role with capability scoped to assigned clients and
  time-bounded access.
- **Marketplace Partner.** A provider of moves, orchestrations, or services in a future marketplace.
  Fits as an external persona with narrowly scoped, auditable participation.
- **External Auditor.** A read-only reviewer needing verifiable access to the audit trail for
  compliance. Fits as a strictly read-only, scoped, fully-logged persona.
- **Auxiliary Supervisor.** A human role dedicated to overseeing the behavior and quality of AI
  Auxiliaries. Fits as an internal governance persona with authority over Auxiliary configuration but
  never over client decisions.

Each of these is a new combination of responsibility and scope layered onto the existing model — none
requires a new architecture. That is the test: **a future persona must be expressible as a scope and
capability set within the existing permission model, or the model (and this chapter) is revised
deliberately to admit it.**

---

## Permission Philosophy

Permissions in Auxion follow a single idea: **ability is granted to match responsibility, and every
use of it is accountable.**

- **Least privilege.** Each persona holds exactly the authority its responsibility requires and no
  more. Access is granted deliberately, not by default, and unused authority is removed.
- **Context-based permissions.** What a user may do depends on context — which client, which stage,
  which relationship — not on a fixed rank. The same capability can apply in one scope and not another.
- **Operational accountability.** Permissions exist to make people answerable for outcomes. The person
  who can do a thing is the person responsible for it having been done.
- **Approval boundaries.** Consequential change is gated by explicit human approval, and the authority
  to approve is bounded by role — operators execute, Strategists and owners authorize commercial and
  strategic decisions, clients authorize what belongs to them.
- **Auditability.** Every consequential action is recorded — who did it, who approved it, when. Nothing
  meaningful happens off the record, including administrative actions.
- **No hidden authority.** There is no secret power and no back door. Authority is legible: what a
  person can do is knowable, and the audit trail proves what they did. The system never acts
  consequentially with no responsible human named.

---

## UX Implications

Because personas differ in responsibility, they experience **different interfaces onto the same truth**
(the "one truth, many views" principle from `05-information-architecture.md`). The product frames the
same underlying reality at the altitude each persona needs:

- **The Business Owner** sees **strategic insight** — Business Health, the Transformation Index, the
  highest-impact moves, and the decisions awaiting them — with operational machinery kept out of view.
- **The Operations Manager** sees **operational execution** — signals to triage, moves to drive,
  orchestrations to monitor, and delivery to keep on track.
- **The Client** sees **transformation progress** — a calm, legible view of what is being done for
  them, what they need to decide, and how far they have come.
- **The Strategist** sees **collaboration and planning** — conversations, client context, recommendations
  to review, and the tools to shape and approve the transformation.
- **The Platform Administrator** sees **governance** — configuration, security, monitoring, the audit
  trail, and user management.

No persona is shown another's interface, and none is given raw complexity they do not need. The design
obligation is to serve each persona's goal directly, so that every user feels the product was built for
their responsibility specifically.

---

## Persona Principles

These principles govern every persona and permission decision. A change that contradicts one is a
change to this chapter first.

1. **Design for responsibility, not title.** We build for what a person is accountable for, not for
   where they sit on an org chart. Authority follows responsibility.
2. **Every interface matches the user's goal.** Each persona's surface is shaped by what they are
   trying to accomplish, framing the same truth at the right altitude for their role.
3. **Hide complexity without hiding capability.** Simpler surfaces (the client's) are not lesser
   products; they are the correct altitude. Capability is disclosed to those responsible for it, not
   removed from the system.
4. **Least privilege is the default.** Users start with the minimum and are granted more deliberately.
   Unearned or unused authority is a liability, not a convenience.
5. **Authority is always accountable.** Anything a persona can do consequentially is recorded against
   them. No power exists in Auxion without a responsible, named human.
6. **Scope over hierarchy.** Access is defined by context and scope — which client, which work — not by
   rank. Seniority is not a skeleton key.
7. **The human always stands between the client and the machine.** Clients never receive raw AI output
   as authority; a Strategist owns the recommendation before it reaches a decision.
8. **Consequential decisions route to the accountable role.** Operators execute; Strategists and owners
   authorize commercial and strategic moves; clients authorize what is theirs. The gate matches the
   accountability.
9. **Trust is built through transparency.** Each persona can see why the product shows what it shows and
   what authority they and others hold. Legibility of the system is itself a feature.
10. **Personas extend by composition, not rewrite.** New users are new combinations of scope and
    capability within the existing model. The framework accommodates growth without restructuring.
