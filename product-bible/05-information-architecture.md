# 05 · Information Architecture

Status: Draft
Owner: Auxion Product Team
Last updated: 2026-07-17

Purpose:
Defines how Auxion's surfaces, navigation, and content are structured and related.

---

> This chapter is Auxion's **architectural blueprint** — the permanent structure of the product. It
> describes how every module, workspace, and navigation area connects. It is deliberately
> **implementation-independent**: it defines product structure, not code, files, or routes. Terms
> used here carry the meanings fixed in `03-product-dna.md`. When structure must change, this chapter
> changes first (see the prime rule in `README.md`).

---

## Introduction

Information Architecture is the difference between a product a person *uses* and a product a person
*understands*. It determines whether someone can find what they need, grasp how the pieces relate, and
move through the system with confidence — or whether they are left hunting through menus for a page
whose relationship to their actual problem is unclear. For Auxion, IA is not decoration on top of
features; it is how the product's model of the business becomes navigable.

A Business Transformation Operating System is structured differently from traditional SaaS. Most SaaS
navigation is a **catalog of pages** — a sidebar of features, each a self-contained destination, with
the burden on the user to assemble them into a coherent picture of their situation. That model treats
the software as a set of tools and the user as the integrator.

Auxion inverts this. Users do not navigate a catalog of features; they **navigate operational
context** — the live state of their business and the work moving through it. A user arrives at a
signal, follows it to the insight it produced, sees the move recommended from it, reviews the evidence,
grants approval, and watches execution — because those things are *related*, not because they happen to
be adjacent menu items. The architecture mirrors the transformation cycle rather than a feature list,
so movement through the product feels like reasoning about the business, not clicking through an app.

Everything below serves that principle: **structure follows the business, not the software.**

---

## Product Structure

Auxion is organized as **four connected layers**. Each layer serves a distinct altitude of the work,
and the layers are continuous — information and decisions flow between them rather than sitting in
silos.

### Layer 1 — Executive Layer
*Command Center · Business Health · Transformation Index*

The altitude of judgment and oversight. This is where the state of the business and the progress of
its transformation are seen whole: current condition (**Business Health**), progress over time
(**Transformation Index**), and the operating surface from which the Auxion team directs work
(**Command Center**). The executive layer answers *"how is the business, and is it improving?"*

### Layer 2 — Operational Layer
*Signals · Moves · Orchestrations · Console*

The altitude of doing. This is where transformation actually happens: **Signals** are detected,
**Moves** are formed and driven, **Orchestrations** automate the mechanical steps, and the **Console**
gives everyone a live operating view. The operational layer answers *"what is happening, and what is
the next move?"*

### Layer 3 — Collaboration Layer
*Conversation Workspace · Strategist · Files · Approvals · Meetings*

The altitude of human judgment and relationship. This is where people decide together: the
**Conversation Workspace** holds the dialogue, the **Strategist** brings expertise and accountability,
**Approvals** record authorization, and **Files** and **Meetings** carry the shared context. The
collaboration layer answers *"who decided, and how did we agree?"*

### Layer 4 — Client Experience
*Client Portal · Deliverables · Billing · Support*

The altitude of the customer's view. This is the trustworthy window a business has into its own
transformation: what is being delivered (**Deliverables**), the commercial relationship (**Billing**),
and help when needed (**Support**), all inside the **Client Portal**. The client layer answers *"what
is Auxion doing for me, and can I see it clearly?"*

### How the layers interact

The layers are a stack, not a set of compartments. A single transformation moves *through* all four:
a signal surfaces in the **Operational Layer**, is discussed and approved in the **Collaboration
Layer**, rolls up into the **Executive Layer's** view of health and progress, and is reflected to the
customer in the **Client Experience**. The same underlying truth is presented at each altitude, framed
for that layer's users. Nothing is re-entered as it moves up or down; the layers are views onto one
connected system, which is precisely what makes Auxion an operating system rather than a bundle of
apps.

---

## Admin Information Architecture

The internal surface (the **Command Center**) is organized into the sections below. Each is defined by
its **Purpose**, **Primary users**, **Inputs**, **Outputs**, and **Relationships**. "Internal users"
means the Auxion team: Strategists, operators, and administrators.

### Console
- **Purpose:** The live operating view — the cockpit showing current state, active signals, and moves in flight.
- **Primary users:** All internal users, as their default working surface.
- **Inputs:** Signals, active Moves, Business Health, Orchestration status.
- **Outputs:** Focus and entry points into every other section; the day's operating picture.
- **Relationships:** Renders a synthesis of Signals, Moves, and Business Health; the front door to the Command Center.

### Command Center
- **Purpose:** The internal surface as a whole — where the team runs transformation across all clients.
- **Primary users:** Strategists, operators, administrators.
- **Inputs:** Every module below.
- **Outputs:** Directed transformation across the client base.
- **Relationships:** The container surface that hosts the Console and all admin modules; internal counterpart to the Client Portal.

### Signals
- **Purpose:** Surface and triage detected changes worth attention across the business.
- **Primary users:** Strategists and operators.
- **Inputs:** Business Scan results, ongoing operational data, Measurement outcomes, Auxiliary observation.
- **Outputs:** Prioritized Signals; the raw material for Insights and Moves.
- **Relationships:** Produced by the Business Scan and by continuous monitoring; feed Moves.

### Moves
- **Purpose:** Form, sequence, and drive the changes the business will make.
- **Primary users:** Strategists (own decisions), operators (drive execution).
- **Inputs:** Recommendations, Insights, evidence, prioritization.
- **Outputs:** Committed Moves with intent and expected outcomes; the unit of transformation.
- **Relationships:** Arise from Signals via Recommendations; require Approvals; carried out in Execution; judged in Measurement.

### Orchestrations
- **Purpose:** Automate the mechanical progression of work and keep records current.
- **Primary users:** Operators (configure and monitor); the system (runs).
- **Inputs:** Approved Moves, defined stages, triggers.
- **Outputs:** Advanced work, triggered next steps, updated state — no consequential decisions.
- **Relationships:** Powers Execution; subordinate to Approvals; connects the stages of the cycle.

### Business Health
- **Purpose:** Present the current-state read of each client's business.
- **Primary users:** Strategists, executives.
- **Inputs:** Business Scan, Measurement results.
- **Outputs:** A dimensional health picture that frames priorities.
- **Relationships:** Output of the Business Scan; updated by Measurement; a snapshot counterpart to the Transformation Index.

### Transformation Index
- **Purpose:** Show compounding transformation progress over time.
- **Primary users:** Strategists, executives.
- **Inputs:** Completed Moves, Measurement, Learning.
- **Outputs:** A headline trajectory of improvement per client.
- **Relationships:** Rises from Measurement and Learning; the movement counterpart to Business Health.

### Clients
- **Purpose:** Hold the businesses Auxion serves and their overall relationship state.
- **Primary users:** Strategists, administrators.
- **Inputs:** Client records, Transformation Stage, engagement history.
- **Outputs:** The organizing entity everything else attaches to.
- **Relationships:** Parent to Projects, Conversations, Files, Meetings, Contracts, Deliverables, Billing.

### Projects
- **Purpose:** Organize sustained bodies of transformation work for a client.
- **Primary users:** Operators, Strategists.
- **Inputs:** Approved Moves, scope, deliverable definitions.
- **Outputs:** Structured delivery with stages and ownership.
- **Relationships:** Belong to a Client; contain Deliverables; realize Moves through Execution.

### Conversations
- **Purpose:** Hold the threaded dialogue and decisions between team and client.
- **Primary users:** Strategists, clients (shared), operators.
- **Inputs:** Messages, shared context, linked Signals/Moves/Files.
- **Outputs:** A durable record of discussion and agreement.
- **Relationships:** Attached to a Client; spans Command Center and Client Portal; source of many Approvals.

### Approvals
- **Purpose:** Record explicit human authorization of consequential change.
- **Primary users:** Strategists and authorized clients (as deciders).
- **Inputs:** A Move or decision requiring authorization.
- **Outputs:** An auditable record of who authorized what, and when.
- **Relationships:** The gate between Recommendation/Move and Execution; referenced by Moves, Contracts, and Deliverables.

### Meetings
- **Purpose:** Capture the synchronous touchpoints in the relationship.
- **Primary users:** Strategists, clients.
- **Inputs:** Scheduling, agendas, outcomes.
- **Outputs:** Shared context and follow-on Moves or Approvals.
- **Relationships:** Attached to a Client and Conversation; feed Signals and Moves.

### Files
- **Purpose:** Hold the shared documents and artifacts of the work.
- **Primary users:** Strategists, operators, clients (scoped).
- **Inputs:** Uploaded and generated artifacts.
- **Outputs:** Referenced evidence and deliverable materials.
- **Relationships:** Attached to Clients, Conversations, Projects, Deliverables.

### Reports
- **Purpose:** Communicate state, progress, and results across clients and time.
- **Primary users:** Strategists, executives.
- **Inputs:** Business Health, Transformation Index, Measurement, Moves.
- **Outputs:** Legible summaries of transformation and outcomes.
- **Relationships:** Draw from the Executive and Operational layers; feed decisions and client communication.

### Settings
- **Purpose:** Configure the workspace, roles, and system behavior.
- **Primary users:** Administrators.
- **Inputs:** Configuration, permissions, integrations.
- **Outputs:** Governed system behavior.
- **Relationships:** Cross-cutting; governs access and behavior of all modules (see `12-security-and-permissions.md`).

---

## Client Information Architecture

The **Client Portal** is intentionally focused. It presents the same underlying truth as the Command
Center, framed for the customer's needs.

- **Dashboard** — the client's Console: current Business Health, active Moves, and what needs their attention. Their operating picture at a glance.
- **Transformation Progress** — the client-facing view of the Transformation Index and Stage: how far the business has come and what is underway.
- **Conversation** — the client side of the Conversation Workspace: their direct line to the Auxion team.
- **Strategist** — a clear presence of the accountable human partner: who is responsible for their transformation and how to reach them.
- **Deliverables** — what is being produced for them, with review and approval where their sign-off is required.
- **Files** — the shared artifacts relevant to them, scoped to what they should see.
- **Approvals** — the decisions awaiting their authorization, presented with the evidence and reasoning to decide well.
- **Billing** — the commercial relationship: proposals, contracts, invoices, and payment, presented plainly.
- **Support** — help when they need it, connected to their real context.

### Why the client experience is intentionally simpler

The client's job is to **understand and decide**, not to operate the machine. Strategists and operators
run the transformation; clients need to see the truth of their business, weigh in where their judgment
is required, and trust that the work is progressing. Exposing the full operational apparatus — signal
triage, orchestration configuration, cross-client tooling — would add cognitive load without adding
value to the client, and it would violate the principle of showing each user exactly what they need.
Simplicity here is not a reduced product; it is the *right altitude* for the client's role. The Portal
is calm and legible on purpose, so the customer's confidence comes from clarity rather than from
mastering a control panel that was never theirs to run.

---

## Navigation Philosophy

Navigation in Auxion moves users through **business context**, not through a menu of features.

- **Navigate context, not pages.** Movement follows the relationships in the business — from a signal
  to its move, from a client to their conversation — so navigation feels like reasoning, not
  file-browsing.
- **Never expose unnecessary complexity.** Each user sees what their role and moment require. The full
  machinery exists, but it is not all on screen at once.
- **Progressive disclosure.** Depth is available on demand. Screens lead with the essential and reveal
  detail as the user goes deeper, so the surface stays calm while the substance stays reachable.
- **Operational grouping.** Things are grouped by how the work actually happens, not by technical
  category. Related operational concepts live together.
- **Clear hierarchy.** At every point the user knows where they are, what contains it, and how to move
  up. Structure is legible, never a maze.
- **Predictable movement.** The same relationships lead to the same places every time. Navigation is
  consistent, so users build a reliable mental map and stop having to think about the interface.

---

## Workspace Philosophy

A **Workspace** is a focused environment built around a body of work, holding everything needed to
carry it forward in one place. It is not a page.

Examples:

- **Command Center** — the workspace for running transformation across all clients.
- **Conversation Workspace** — the workspace for a specific dialogue: the thread, its context, linked signals and moves, files, and approvals, together.
- **Moves Workspace** — the workspace for forming and driving a move: its intent, evidence, recommendation, approval, and execution status.
- **Orchestration Workspace** — the workspace for configuring and monitoring automated progression of work.

### How workspaces differ from pages

A **page** is a destination that displays a slice of data. A **workspace** is a *context* that gathers
everything relevant to a task so a user can complete meaningful work without leaving. A page shows you
a conversation's messages; a workspace lets you read the thread, see the linked move, review the
evidence, and grant the approval — because those belong to the same piece of work. Workspaces embody
the IA thesis: the product is organized around operational context, and a workspace is that context
made into a place. Pages fragment work across destinations; workspaces keep it whole.

---

## Relationships Between Modules

Modules in Auxion are connected by the flow of transformation, not by menu adjacency. The primary
spine is the transformation cycle:

```
   Business Scan
        ↓
     Signals
        ↓
      Moves
        ↓
    Approvals
        ↓
    Execution
        ↓
  Transformation
        ↓
   Measurement
        ↓
     Learning
        ↓
   (back to Signals)
```

The **Business Scan** produces **Signals**; signals are shaped (via insights and recommendations) into
**Moves**; moves pass through **Approvals** into **Execution**; execution produces
**Transformation**, which is quantified by **Measurement** and captured as **Learning** — which
sharpens the next round of Signals. This is the closed loop from `02-product-philosophy.md`, expressed
as module structure.

The entity relationships around it:

- **Clients** are the root. Everything attaches to a client.
- **Projects** belong to a Client and organize sustained work; they contain **Deliverables**.
- **Conversations** belong to a Client and are the human channel; they generate **Approvals** and
  reference **Files**, **Signals**, and **Moves**.
- **Meetings** belong to a Client and Conversation; they surface **Signals** and produce follow-on
  **Moves** and **Approvals**.
- **Contracts** formalize the commercial commitment for a Client; they depend on **Approvals** and
  gate the start of **Projects** and delivery.
- **Deliverables** belong to a Project; they require **Approvals** (often the client's) and reference
  **Files**.
- **Approvals** are the connective authorization across the system — a Move, a Contract, and a
  Deliverable each pass through an approval, and every approval names an accountable person.
- **Files** are shared evidence and artifacts, attached wherever context needs them — Conversations,
  Projects, Deliverables, Clients.

The consistent pattern: **Clients** hold everything; **Approvals** gate everything consequential; and
the **transformation cycle** drives everything forward. No module is an island.

---

## Scalability

The four-layer architecture is designed so new capability is **added into the structure, not bolted
onto it**. Because modules connect through the transformation cycle and the client entity rather than
through hard-wired adjacency, new modules extend the system without reshaping it. Anticipated future
additions and where they fit:

- **Marketplace** — a catalog of moves, orchestrations, or partner services. Slots into the
  Operational Layer as a source of Recommendations and pre-built Orchestrations; no new spine.
- **Voice** — a new *modality* for existing capabilities (reviewing signals, approving moves). Rides
  the existing modules; it is an input/output channel, not a new structure.
- **Mobile** — a responsive surface of the same layers, following the responsive philosophy in
  `04-design-principles.md`. Reorganizes presentation, not architecture.
- **White-label** — a branding and configuration layer over the Client Experience. Governed by
  Settings; the underlying structure is unchanged.
- **Enterprise** — deeper hierarchy (multi-entity clients, org roles, advanced permissions). Extends
  the Client entity and the permission model; the layers hold.
- **Integrations** — external systems feeding Signals and receiving Orchestration actions. Attach at
  the Operational Layer's edges as inputs and outputs; the cycle absorbs them natively.
- **Additional AI Auxiliaries** — specialized intelligences for particular domains. Added as more
  producers of Insights and Recommendations under the same human-approval contract; the Auxiliary role
  is defined to accommodate many instances.
- **Future analytics** — richer measurement and reporting. Extend the Executive Layer (Reports,
  Transformation Index) as new views on existing truth.

Each of these plugs into an existing seam — the cycle, the client entity, the surfaces, or Settings —
so the platform grows by *deepening* its layers, never by restructuring them. That is the test for any
new module: **it must fit an existing seam of the architecture, or the architecture (this chapter) is
revised deliberately to admit it.**

---

## Information Architecture Principles

These principles govern all structural decisions. Any change that contradicts one is a change to this
chapter first.

1. **Context before navigation.** Users move through the state of their business, not a list of
   features. Structure reflects operational relationships, not a menu.
2. **Relationships before menus.** How things connect is more important than how they are listed. The
   architecture encodes the real links between signals, moves, clients, and work.
3. **One truth, many views.** A fact exists once and is presented at the right altitude to each user.
   The same reality frames differently for executive, operator, and client — never duplicated, never
   contradictory.
4. **Right altitude for the role.** Each surface shows exactly what its users need to decide and act —
   no more. The client's simplicity and the operator's density are both correct for their altitude.
5. **Operational grouping.** Things live together because the work joins them, not because they share
   a technical category.
6. **Progressive disclosure by default.** Lead with the essential; reveal depth on demand. Complexity
   is available, never imposed.
7. **The cycle is the spine.** The transformation cycle is the primary organizing structure; modules
   are understood by where they sit on it.
8. **Clients hold everything; approvals gate everything.** The client is the root entity and the
   named human approval is the gate on every consequential path — two fixed points the whole structure
   hangs from.
9. **Workspaces over pages.** Organize around bodies of work that keep context whole, not around
   destinations that fragment it.
10. **Seams, not rewrites.** New capability enters through defined seams — the cycle, the client
    entity, the surfaces, Settings — so the platform scales by deepening, never by restructuring.
11. **Predictable and legible.** The same relationship always leads to the same place, and users
    always know where they are. Structure is a reliable map, not a puzzle.
