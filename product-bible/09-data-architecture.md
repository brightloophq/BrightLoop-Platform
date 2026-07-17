# 09 · Data Architecture

Status: Draft
Owner: Auxion Product Team
Last updated: 2026-07-17

Purpose:
Defines the data model, entities, and persistence contracts that underpin the product.

---

> This chapter is Auxion's **canonical business domain model**. It is not a database schema and not a
> Supabase design — it models business reality, not storage. Every future database, API, event, AI
> engine, workflow, report, and integration must align with the entities and relationships defined
> here. Terms are canonical per `03-product-dna.md`; modules per `08-product-modules.md`. When the
> domain model changes, this chapter changes first (see the prime rule in `README.md`).

---

## Introduction

**Business entities matter more than database tables.** A table is an implementation choice — it can
be split, merged, denormalized, or migrated as engineering needs change. A business entity is a
durable fact about how the business works: a *Client*, a *Move*, an *Approval* mean the same thing
this year and next, regardless of how they are stored. When a product models tables first, its meaning
drifts every time the storage changes. When it models the business first, the storage can evolve
freely while the meaning stays fixed.

Good domain architecture is the foundation everything else stands on:

- **Scalability** — a clean model grows by adding entities and relationships, not by rewriting.
- **Reporting** — reports are only as trustworthy as the entities they aggregate; a coherent model
  makes measurement honest.
- **Automation** — orchestration acts on well-defined entities with clear lifecycles; ambiguous data
  makes automation unsafe.
- **AI** — the Auxiliary reasons over entities and their history; a faithful model is the difference
  between grounded intelligence and noise.
- **Integrations** — external systems map to entities; stable entities give integrations a stable
  target.
- **Long-term maintainability** — a model that mirrors the business stays understandable for years,
  because the business is the thing everyone already understands.

The rest of this chapter defines that model: the entities, how they relate, how they move through
their lifecycles, who owns them, and the integrity rules that keep them trustworthy.

---

## Domain Model Philosophy

Auxion models **business reality, not software convenience.** The following commitments express what
that means:

- **Business-first modeling.** Entities are named and shaped after real business concepts, not after
  technical structures. If a business person would not recognize the entity, it is modeled wrong.
- **Single source of truth.** Every fact lives in exactly one authoritative entity. Data is referenced,
  not copied; when a fact changes, it changes in one place and is correct everywhere.
- **Relationships over duplication.** Connections between entities are modeled as relationships, never
  as duplicated data. Duplication is how a system slowly starts contradicting itself.
- **Event-driven thinking.** The model records not just current state but the *events* that produced it
  (see §Event Philosophy). What happened is as much a part of the domain as what is.
- **Immutable history.** The record of what occurred is never rewritten. State moves forward; history
  is appended, not edited.
- **Auditability.** Every consequential change is attributable — to a person, at a time, with a reason
  where one applies. The model is built so accountability is inherent, not bolted on.
- **Context preservation.** Entities keep the context that gives them meaning — a Move remembers the
  Signal and Evidence that justified it. Stripping context to save space destroys the reasoning that
  makes the data useful.

The through-line: Auxion's data is a faithful, durable representation of how a business actually
transforms. We optimize the model for *truth and longevity*, and let the storage layer optimize for
performance beneath it.

---

## Core Business Entities

Each entity is defined by its **Purpose**, **Description**, **Owned By**, **Lifecycle**,
**Relationships**, and **Examples**. Roles referenced are the canonical families from
`06-user-personas.md`.

### Identity & Access

**Organization**
- *Purpose:* The top-level tenant boundary. *Description:* An account that owns workspaces, users, and configuration. *Owned By:* Platform Administrator. *Lifecycle:* Provisioned → Active → Suspended → Closed. *Relationships:* Contains Workspaces, Users, Clients, Subscriptions. *Examples:* The Auxion operating tenant; a future white-label tenant.

**Workspace**
- *Purpose:* An operating environment within an Organization. *Description:* The container in which transformation work happens for a set of clients. *Owned By:* Platform Administrator. *Lifecycle:* Created → Active → Archived. *Relationships:* Belongs to Organization; scopes Clients, Projects, Conversations. *Examples:* A team's working environment.

**User**
- *Purpose:* An authenticated person. *Description:* An individual who signs in and acts, always carrying a Role. *Owned By:* Platform Administrator (provisioning); the User (their profile). *Lifecycle:* Invited → Active → Suspended → Deactivated. *Relationships:* Holds a Role; belongs to an Organization; may be tied to a Client (client users) or the Auxion team. *Examples:* A Strategist; a Business Owner.

**Role**
- *Purpose:* A named bundle of authority matched to responsibility. *Description:* Defines what a User may do (`owner`, `admin`, `team_member`, `client_admin`, `client_member`). *Owned By:* Platform Administrator. *Lifecycle:* Defined → Assigned → Revised. *Relationships:* Assigned to Users; composed of Permissions. *Examples:* `client_admin` for a Business Owner.

**Permission**
- *Purpose:* A single grantable capability. *Description:* An atomic ability (e.g., approve a move, view own client) that Roles are built from. *Owned By:* Platform Administrator (definition). *Lifecycle:* Defined → Composed into Roles. *Relationships:* Composes Roles; enforced by the Authorization service. *Examples:* `own.deliverables.approve`; `clients.update`.

### People & Relationship

**Client**
- *Purpose:* A business Auxion transforms. *Description:* The customer organization and the root that most work attaches to. *Owned By:* Strategist (relationship); Platform Administrator (record). *Lifecycle:* Prospect → Member → Active → Post-launch → Churned/Renewed. *Relationships:* Parent to Projects, Conversations, Files, Meetings, Deliverables, Contracts, Invoices, Business Scans. *Examples:* A retail business in transformation.

**Strategist**
- *Purpose:* The accountable human partner for a Client. *Description:* A User (internal role) who owns strategy and the relationship. *Owned By:* Platform Administrator (assignment). *Lifecycle:* Assigned → Active → Reassigned. *Relationships:* Assigned to Clients; owns Conversations, Approvals, Proposals. *Examples:* The Strategist guiding a Client's transformation.

**AI Auxiliary**
- *Purpose:* An instance of Auxion's intelligence. *Description:* A defined AI capability that observes, analyzes, and recommends — never decides. *Owned By:* Platform Administrator / Auxiliary Supervisor (future). *Lifecycle:* Configured → Active → Retired. *Relationships:* Produces Recommendations, Insights, Summaries; bounded by the Human + AI contract. *Examples:* The Recommendation Engine acting on a Client's signals.

### Transformation Cycle

**Project**
- *Purpose:* Organize sustained transformation work for a Client. *Description:* A structured body of delivery with stages and ownership. *Owned By:* Strategist / Operations Manager. *Lifecycle:* Created → Active → Paused/Delayed → In review → Completed → Post-launch. *Relationships:* Belongs to a Client; contains Deliverables and Milestones; realizes Moves. *Examples:* A brand-and-website transformation project.

**Business Scan**
- *Purpose:* The current-state diagnostic of a Client. *Description:* A structured assessment across operational dimensions. *Owned By:* Strategist (interpretation); Business Owner (input). *Lifecycle:* Initiated → Completed → Superseded (by a re-scan). *Relationships:* Produces Business Health and initial Signals; belongs to a Client. *Examples:* The onboarding diagnostic that sets the baseline.

**Signal**
- *Purpose:* A detected change worth attention. *Description:* The raw material of a transformation cycle. *Owned By:* Operations Manager / Strategist. *Lifecycle:* Detected → Validated → Prioritized → (becomes an Insight) / Archived. *Relationships:* Arises from Business Scan, Measurement, or monitoring; carries Evidence; leads to an Insight. *Examples:* A drop in a delivery metric.

**Evidence**
- *Purpose:* The factual basis of a claim. *Description:* The specific data and observations supporting a Signal, Insight, or Recommendation. *Owned By:* The system (attached, not authored). *Lifecycle:* Collected → Attached → Referenced. *Relationships:* Attached to Signals, Insights, Recommendations; the basis of Confidence. *Examples:* The metric series behind a signal.

**Insight**
- *Purpose:* Interpreted meaning from a Signal. *Description:* What is happening, why it matters, at what confidence. *Owned By:* Strategist (owns); AI Auxiliary (produces candidate). *Lifecycle:* Generated → Endorsed → (drives a Recommendation) / Dismissed. *Relationships:* Derives from a Signal + Evidence; leads to a Recommendation. *Examples:* "Delivery slipped because of an intake bottleneck."

**Recommendation**
- *Purpose:* A proposed Move with reasoning. *Description:* A well-formed option — expected outcome, evidence, confidence. *Owned By:* AI Auxiliary (produces); Strategist (accepts/rejects). *Lifecycle:* Proposed → Accepted / Adjusted / Rejected. *Relationships:* From an Insight; becomes a Move on acceptance. *Examples:* "Add an intake triage step to cut delivery time ~15%."

**Move**
- *Purpose:* A committed, measurable change — the unit of transformation. *Description:* A change with stated intent and a defined outcome. *Owned By:* Strategist (commits); Operations Manager (drives). *Lifecycle:* Draft → Recommended → Approved → Executing → Completed → Measured. *Relationships:* From a Recommendation; requires an Approval; produces Executions and Measurement. *Examples:* "Implement intake triage."

**Approval**
- *Purpose:* Explicit human authorization of consequential change. *Description:* The accountability gate. *Owned By:* Strategist / Business Owner / authorized Client. *Lifecycle:* Requested → Granted / Denied. *Relationships:* Gates Moves, Contracts, Deliverables; recorded as an Audit Event. *Examples:* A Business Owner approving a contract.

**Execution**
- *Purpose:* The carrying-out of an approved Move. *Description:* Governed work advancing through stages. *Owned By:* Operations Manager. *Lifecycle:* Started → In progress → Completed / Failed. *Relationships:* Realizes a Move; driven by Orchestrations; produces the result Measurement evaluates. *Examples:* The work to stand up the triage step.

**Metric**
- *Purpose:* A measured quantity tied to an outcome. *Description:* A defined measurement with a value over time. *Owned By:* The system (computed). *Lifecycle:* Defined → Measured → Historized. *Relationships:* Feeds Measurement, Business Health, Transformation Index, Reports. *Examples:* Average delivery time.

**Business Health**
- *Purpose:* Current-state read of a Client. *Description:* A dimensional score of present condition. *Owned By:* The system (computed); Strategist (interprets). *Lifecycle:* Baselined → Updated → Historized. *Relationships:* From Business Scan and Measurement; snapshot counterpart to the Transformation Index. *Examples:* A health profile across operational dimensions.

**Transformation Index**
- *Purpose:* Compounding progress over time. *Description:* A headline trajectory of improvement. *Owned By:* The system (computed). *Lifecycle:* Baselined → Updated per measured Move → Historized. *Relationships:* Rises from Measurement and Learning; movement counterpart to Business Health. *Examples:* A rising index over a quarter of completed moves.

**Goal**
- *Purpose:* A desired outcome the transformation aims at. *Description:* A stated objective that orients moves and measures. *Owned By:* Business Owner / Strategist. *Lifecycle:* Set → Active → Achieved / Revised / Retired. *Relationships:* Frames Moves and Metrics; assessed against Business Health. *Examples:* "Cut delivery time by 20% this quarter."

**Milestone**
- *Purpose:* A meaningful marker of progress. *Description:* A defined checkpoint within a Project or Goal. *Owned By:* Operations Manager / Strategist. *Lifecycle:* Pending → In progress → Awaiting approval → Approved → Completed. *Relationships:* Belongs to a Project; may require an Approval; marks Client progress. *Examples:* "Triage step live."

*How objectives and measurement relate.* These entities form the objective-and-measurement fabric of the
domain, and each plays a distinct role: **Goals** define intended business outcomes; **Metrics** provide
observable evidence of progress or performance; **Milestones** represent meaningful checkpoints along the
way; **Business Health** reflects the organization's current operational condition; and the
**Transformation Index** reflects directional movement and progress over time. A guiding rule holds across
all of them: **no single Metric should determine either Business Health or the Transformation Index without
appropriate context and evidence** — condition and progress are read from the whole picture, never reduced
to one number.

### Collaboration

**Conversation**
- *Purpose:* The threaded dialogue and decisions with a Client. *Description:* The durable, accountable record of discussion. *Owned By:* Strategist; shared with Client. *Lifecycle:* Open → Waiting → Resolved → Closed. *Relationships:* Belongs to a Client; contains Messages; links Files, Meetings, Moves; source of Approvals. *Examples:* A discovery conversation.

**Message**
- *Purpose:* A single communication in a Conversation. *Description:* A posted message, client-facing or internal-only. *Owned By:* Its author. *Lifecycle:* Drafted → Sent → Read. *Relationships:* Belongs to a Conversation; may carry File attachments. *Examples:* A strategist's reply; an internal note.

**Meeting**
- *Purpose:* A synchronous touchpoint. *Description:* A scheduled interaction with agenda and outcomes. *Owned By:* Strategist. *Lifecycle:* Scheduled → Held → Completed / Cancelled. *Relationships:* Belongs to a Client and Conversation; feeds Signals and Moves. *Examples:* A strategy call.

**Deliverable**
- *Purpose:* An output produced for a Client. *Description:* A work product with a review lifecycle. *Owned By:* Operations Manager / Strategist; reviewed by Client. *Lifecycle:* Draft → Submitted → In review → Approved / Revision requested → Final. *Relationships:* Belongs to a Project; references Files; requires an Approval. *Examples:* A brand guide.

**File**
- *Purpose:* A stored document or artifact. *Description:* A versioned, access-controlled asset. *Owned By:* Its uploader; scoped by Authorization. *Lifecycle:* Uploaded → Versioned → Archived. *Relationships:* Attached to Conversations, Deliverables, Projects, Clients; read by Document Intelligence. *Examples:* A logo file; a contract PDF.

**Knowledge Asset**
- *Purpose:* Reusable, structured knowledge. *Description:* A curated piece of transformation knowledge (a playbook, a proven move). *Owned By:* Strategist / Platform (future marketplace). *Lifecycle:* Drafted → Published → Deprecated. *Relationships:* Grounds Insights and Recommendations via the Knowledge Engine. *Examples:* A reusable intake-triage playbook.

### Commercial

**Proposal**
- *Purpose:* A concrete offer to a Client. *Description:* Scope and terms presented for acceptance. *Owned By:* Strategist. *Lifecycle:* Draft → Review → Sent → Viewed → Accepted / Change requested / Rejected / Expired. *Relationships:* Belongs to a Client; may become a Contract; references pricing. *Examples:* A transformation engagement proposal.

**Contract**
- *Purpose:* A formalized agreement. *Description:* The signed commitment governing an engagement. *Owned By:* Strategist; authorized by Client. *Lifecycle:* Pending → Sent → Signed by client → Countersigned → Active → Voided. *Relationships:* From an accepted Proposal; requires Approvals; gates Project start and Invoices. *Examples:* A signed statement of work.

**Invoice**
- *Purpose:* A request for payment. *Description:* A billed amount tied to an engagement. *Owned By:* Strategist / Platform Administrator (finance authority). *Lifecycle:* Draft → Sent → Pending → Paid / Overdue / Failed / Refunded. *Relationships:* Belongs to a Client; tied to a Contract; settled by Payment. *Examples:* A deposit invoice.

**Subscription**
- *Purpose:* An ongoing commercial relationship. *Description:* A recurring plan governing access and billing. *Owned By:* Platform Administrator. *Lifecycle:* Active → Past due → Cancelled → Renewed. *Relationships:* Belongs to an Organization/Client; drives recurring Invoices. *Examples:* A monthly transformation retainer.

### System

**Notification**
- *Purpose:* A timely alert to a User. *Description:* A delivered message about something requiring attention. *Owned By:* The system; addressed to a User. *Lifecycle:* Created → Delivered → Read → Dismissed. *Relationships:* References the entity it concerns (a Move, an Approval, a Message). *Examples:* "An approval is waiting for you."

**Audit Event**
- *Purpose:* An immutable record of a consequential action. *Description:* Who did what, when, and (where relevant) why. *Owned By:* The system (append-only). *Lifecycle:* Recorded (never edited or deleted). *Relationships:* References the entity and actor; the substrate of accountability. *Examples:* "Strategist approved Move X at time T."

**Integration**
- *Purpose:* A connection to an external system. *Description:* A configured link that feeds or receives data. *Owned By:* Platform Administrator. *Lifecycle:* Configured → Active → Disabled. *Relationships:* Feeds Signals; receives Orchestration actions; behind consistent contracts. *Examples:* A payment provider; an automation platform.

**Report**
- *Purpose:* A communicated summary or analysis. *Description:* A composed view of state, progress, and results. *Owned By:* Strategist / Executive. *Lifecycle:* Generated → Delivered → Archived. *Relationships:* Aggregates Metrics, Business Health, Transformation Index, Moves. *Examples:* A quarterly transformation report.

---

## Operational Risk

**Operational Risk** is a first-class business-domain concept. It is a structured representation of a
condition, dependency, uncertainty, control weakness, or potential consequence that may negatively affect
an organization's objectives, operations, customers, compliance, finances, reputation, or transformation
efforts. It is the domain's way of naming *what could go wrong*, so that the transformation cycle can reason
about it deliberately rather than being surprised by it.

An Operational Risk lives inside the transformation cycle alongside Signals, Insights, Recommendations, and
Moves, and may be:

- **Surfaced by a Signal** — a detected condition or change raises the risk to attention.
- **Interpreted through an Insight** — the risk's meaning, cause, and stakes are made clear.
- **Associated with a Recommendation or Move** — a proposed or committed change addresses it.
- **Assigned a severity and likelihood** — so risks can be weighed and prioritized against one another.
- **Linked to affected business objectives, processes, teams, or systems** — so its blast radius is
  understood and owned.
- **Mitigated through approved actions** — treatment happens as governed Moves that pass through Approval.
- **Monitored over time** — the risk's status is tracked as conditions and treatments evolve.
- **Retained in the audit and organizational knowledge history** — so what was risked, decided, and learned
  is preserved (`Audit Event`, `Knowledge Asset`).

The Human + AI boundary applies to risk exactly as it does to every consequential concept (`10`, `12`):

- **The Auxiliary may identify risks and recommend their treatment** — surfacing, interpreting, scoring, and
  proposing mitigations, with reasoning and confidence attached.
- **The Auxiliary may not independently accept, dismiss, approve, or execute risk treatment** — accepting a
  risk, dismissing it, or authorizing a mitigation is a consequential decision.
- **Human owners retain accountability** — a named person owns each risk and its treatment, and every
  acceptance, dismissal, or mitigation passes through an explicit **Approval** on the record.

---

## Entity Relationships

Entities connect through the transformation cycle and the Client root, never by ad-hoc coupling. The
primary spine:

```
   Organization
        ↓
     Clients
        ↓
     Projects
        ↓
  Business Scans
        ↓
     Signals  →  Evidence
        ↓
    Insights  →  Recommendations
        ↓
      Moves
        ↓
    Approvals
        ↓
    Executions
        ↓
   Measurement (Metrics)
        ↓
 Transformation Index  ↔  Business Health
```

Around the spine:

- **Clients** are the root: Projects, Conversations, Files, Meetings, Deliverables, Contracts,
  Proposals, Invoices, and Business Scans all belong to a Client.
- **Strategists** are assigned to Clients and own Conversations, Proposals, and consequential Approvals.
- **Conversations** hold Messages, link Files and Meetings, and generate Approvals; they run alongside
  the whole cycle.
- **Files** attach wherever evidence or output lives — Conversations, Deliverables, Projects — and are
  read by Document Intelligence.
- **Meetings** belong to a Client and Conversation, and feed Signals and Moves.
- **Approvals** gate Moves, Contracts, and Deliverables, and each is recorded as an Audit Event.
- **Reports** aggregate Metrics, Business Health, and the Transformation Index across a Client and time.
- **Knowledge Assets** ground Insights and Recommendations through the Knowledge Engine.
- **AI Auxiliaries** produce Recommendations, Insights, and Summaries — always as proposals, never as
  authorized actions.

Every relationship is a defined seam. No entity reaches into another except through its documented
relationships.

---

## Entity Lifecycles

Major entities have explicit lifecycle states. A state change is legal only along defined transitions
(mirroring the state-machine discipline of the platform). Selected lifecycles:

- **Signal:** Detected → Validated → Prioritized → Archived (or promoted to an Insight).
- **Move:** Draft → Recommended → Approved → Executing → Completed → Measured.
- **Conversation:** Open → Waiting → Resolved → Closed.
- **Proposal:** Draft → Review → Sent → Viewed → Accepted / Change requested / Rejected / Expired.
- **Contract:** Pending → Sent → Signed by client → Countersigned → Active → Voided.
- **Invoice:** Draft → Sent → Pending → Paid / Overdue / Failed / Refunded.
- **Deliverable:** Draft → Submitted → In review → Approved / Revision requested → Final.
- **Milestone:** Pending → In progress → Awaiting approval → Approved → Completed.
- **Client:** Prospect → Member → Active → Post-launch → Churned / Renewed.
- **Approval:** Requested → Granted / Denied (terminal, recorded).
- **Project:** Created → Active → Paused / Delayed → In review → Completed → Post-launch.

Two rules hold for every lifecycle: **only defined transitions are legal**, and **every transition of a
consequential entity is recorded as an Audit Event**. History moves forward; states are not silently
rewound.

---

## Ownership Rules

Ownership answers four questions for every entity — who may **create**, **modify**, **approve**, and
**archive** it — and how ownership **transfers**. The governing principle (from `06-user-personas.md`):
ability matches responsibility, and every consequential action is accountable.

- **Create.** The persona responsible for an entity's existence creates it — Strategists create
  Proposals and Conversations; Operations Managers create Moves and Deliverables; Business Scans are
  created on a Client's behalf; the system creates Audit Events, Metrics, and Notifications.
- **Modify.** Only roles with the relevant capability and scope may modify an entity, and only in
  states that permit it (a `Final` deliverable or an `Active` contract is not freely edited). Clients
  modify only their own scoped entities.
- **Approve.** Consequential entities pass through an Approval owned by the accountable role —
  Strategists/owners authorize commercial and strategic moves; Business Owners authorize what is
  theirs; operators do **not** hold commercial/finance approval.
- **Archive.** Entities are archived (soft-removed), not destroyed, by a role with authority over them.
  Audit Events and history are never archived away — they are permanent.
- **Transfer.** Ownership of a relationship (e.g., a Client's Strategist) transfers explicitly, is
  recorded as an Audit Event, and carries the associated authority to the new owner. Nothing changes
  hands silently.

Scope is enforced structurally: client entities are bounded to their Client, and that boundary is
guaranteed at the data layer (row-level scoping), not merely in the interface.

---

## Data Integrity Principles

These principles keep the domain trustworthy. A design that violates one is corrected, or this chapter
is changed deliberately.

1. **One source of truth.** Every fact has exactly one authoritative home. Data is referenced, never
   duplicated, so it can never disagree with itself.
2. **Soft delete over hard delete.** Consequential entities are archived, not destroyed. History and
   context are preserved; nothing meaningful is truly erased.
3. **Immutable audit history.** Audit Events are append-only — never edited, never deleted. The record
   of what happened is permanent.
4. **Relationship integrity.** References always point to something real. Orphaned or dangling
   relationships are invalid states the model does not permit.
5. **Business identity over technical IDs.** Entities are understood by their business meaning, not by
   opaque keys. Technical identifiers serve the model; they are not the model.
6. **Historical consistency.** Past records reflect the state as it was, not as it later became.
   Recomputing history to match the present is forbidden.
7. **Legal transitions only.** Entities move between states only along defined lifecycle transitions.
   An illegal state change is rejected, not absorbed.
8. **Context travels with the entity.** An entity keeps the context that justifies it — a Move
   remembers its Signal, Evidence, and Approval. Meaning is never stripped for convenience.
9. **Scope is enforced at the data layer.** Access boundaries (a Client sees only their own data) are
   guaranteed structurally, not just by the interface. The database is the last line, not the first.
10. **Consequential change is attributable.** Every meaningful change names a responsible actor and a
    time. There is no anonymous consequential action.
11. **Validity at the boundary.** Data is validated against its contract before it enters the model, so
    invalid state never persists. The model holds only well-formed truth.
12. **The model is business-faithful.** Entities mean what the business means. When reality and the
    model diverge, the model (this chapter) is corrected — meaning is never quietly bent to fit storage.

---

## Event Philosophy

Auxion records **business events, not only records.** A record tells you the current state of a thing;
an event tells you *what happened* to produce it. The domain captures both, because the history of
change is itself valuable business data.

Representative events:

- **Signal Created** — a change was detected.
- **Move Approved** — a consequential change was authorized (by whom, when).
- **Meeting Completed** — a synchronous touchpoint occurred and produced outcomes.
- **Proposal Accepted** — a client committed to an offer.
- **Transformation Updated** — measured progress moved the index.

Why event history matters:

- **AI learning.** The Auxiliary learns from what happened, not just from current state. A rich event
  history is the training ground for better recommendations and predictions.
- **Reporting.** Honest reporting needs the sequence of events — velocity, turnaround, and completion
  are all measures *of change over time*, which only events capture.
- **Accountability.** Events are the audit trail. "Who approved this and when" is an event, and events
  are what make Auxion answerable.

Events are immutable and append-only. Current state is a projection of the event history, never a
replacement for it. This is what lets Auxion explain not just *what is* but *how it came to be* — the
foundation of a system that reasons about transformation over time.

---

## Future Extensibility

The domain model is designed so major future capabilities attach to existing entities and seams rather
than forcing a redesign:

- **White-label** — a presentation and configuration layer over the **Organization** entity; the domain
  is unchanged.
- **Enterprise** — deeper hierarchy on **Organization** and **Client** (multi-entity structures, org
  roles); the entities extend, the model holds.
- **Marketplace** — **Knowledge Assets** and move templates become shareable/tradeable; a new source of
  Recommendations, not a new spine.
- **External APIs** — the API Layer exposes existing entities under contracts; no new domain concepts
  required.
- **Mobile / Voice** — new modalities over existing entities; they read and write the same model.
- **Multiple organizations** — the **Organization** boundary already tenants the model; scaling to many
  is configuration, not redesign.
- **Custom AI Auxiliaries** — new **AI Auxiliary** instances under the same non-decision contract; the
  entity is defined to accommodate many.
- **Future modules** — attach at the transformation cycle, the Client root, or the platform services,
  as detailed in `05-information-architecture.md` and `08-product-modules.md`.

The test for any extension: **it must be expressible as new entities, relationships, or scopes within
this model — attaching at a defined seam — or the model (this chapter) is revised deliberately to admit
it.** Because the model mirrors the durable reality of business transformation, that reality rarely
needs to be redrawn; it grows.
