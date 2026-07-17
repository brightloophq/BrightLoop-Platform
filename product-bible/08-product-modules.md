# 08 · Product Modules

Status: Draft
Owner: Auxion Product Team
Last updated: 2026-07-17

Purpose:
Enumerates the functional modules that compose the Auxion product and what each one owns.

---

> This chapter is the definitive **catalogue of Auxion's capabilities** and its modular architecture.
> It is not a feature list — it defines the modules of the Business Transformation Operating System,
> each with a single responsibility and defined seams. It is the reference for product planning,
> engineering, UX, APIs, and roadmap. Terms are canonical per `03-product-dna.md`; structure follows
> `05-information-architecture.md`. When modules change, this chapter changes first (see the prime rule
> in `README.md`).

---

## Introduction

Auxion is built as a collection of **interconnected operational modules**, not a pile of isolated
features. The distinction is structural. A feature is a thing the software can do; a module is a
capability with a clear responsibility, a defined boundary, and explicit seams to the rest of the
system. Features accumulate into clutter; modules compose into a system.

This matters because Auxion's job is continuous transformation, which is a *connected* process — a
signal becomes an insight becomes a move becomes a measured outcome. If each of those lived in an
isolated feature, the connective tissue would be the user's problem to maintain, and the product would
fragment into the very disconnection Auxion exists to end (`02-product-philosophy.md`).

So every module in Auxion obeys two rules at once: it has a **single responsibility** it owns
completely, and it **contributes to the continuous transformation cycle** through defined connections
to other modules. A module is neither an island nor a blob. It does one thing well and hands off
cleanly. That is what lets the platform stay coherent as it grows, evolve module by module without
collapse, and present the user with one connected system rather than a toolbox.

---

## Module Framework

Every module in this chapter is defined by the same eight-part structure, so the catalogue is
consistent and comparable:

- **Purpose** — the single responsibility the module owns.
- **Primary Users** — the personas who work in it (per `06-user-personas.md`).
- **Inputs** — what flows into it.
- **Outputs** — what it produces for the rest of the system.
- **Dependencies** — modules or services it relies on to function.
- **Connected Modules** — the modules it exchanges with across defined seams.
- **Success Metrics** — how we know the module is doing its job.
- **Future Expansion** — where the module can grow without breaking its boundary.

---

## Core Modules

### 1. Command Center
- **Purpose:** The internal operating surface where the Auxion team runs transformation across all clients.
- **Primary Users:** Strategist, Operations Manager, Platform Administrator.
- **Inputs:** State from every operational and executive module.
- **Outputs:** Directed attention and entry points into all internal work.
- **Dependencies:** Authentication, Authorization, all core modules it surfaces.
- **Connected Modules:** Signals, Moves, Business Health, Transformation Index, Conversations, Approvals.
- **Success Metrics:** Team can find and act on what matters without hunting; time-to-action on new signals.
- **Future Expansion:** Configurable operator views; cross-client portfolio management.

### 2. Business Scan
- **Purpose:** Establish the honest, structured current-state diagnostic of a business.
- **Primary Users:** Business Owner (provides input), Strategist (interprets).
- **Inputs:** Assessment responses, business profile, connected data.
- **Outputs:** Business Health baseline and the first Signals.
- **Dependencies:** Business Intelligence Engine, Storage.
- **Connected Modules:** Business Health, Signals, Transformation Index (baseline).
- **Success Metrics:** Completion rate; baseline accuracy as judged by Strategist and client; time to complete.
- **Future Expansion:** Deeper domain scans; periodic re-scans; industry benchmarking.

### 3. Signals
- **Purpose:** Detect, triage, and prioritize changes in the business worth attention.
- **Primary Users:** Operations Manager, Strategist.
- **Inputs:** Business Scan results, ongoing monitoring, Measurement outcomes, Auxiliary observation.
- **Outputs:** Prioritized signals ready to become insights.
- **Dependencies:** Business Intelligence Engine, Integrations, Observability.
- **Connected Modules:** Business Scan, Insights, Measurement.
- **Success Metrics:** Signal precision (share acted on); false-signal rate; time from event to detection.
- **Future Expansion:** More detection sources; configurable thresholds; predictive signals.

### 4. Insights
- **Purpose:** Interpret signals and evidence into meaning a person can act on.
- **Primary Users:** Strategist (owns), Auxiliary (produces candidates).
- **Inputs:** Signals, Evidence, business context.
- **Outputs:** Insights with stated confidence, ready to drive recommendations.
- **Dependencies:** Business Intelligence Engine, Knowledge Engine.
- **Connected Modules:** Signals, Recommendation Engine, Moves.
- **Success Metrics:** Insight adoption; accuracy over time; confidence calibration.
- **Future Expansion:** Domain-specialized insight models; comparative insights across clients.

### 5. Moves
- **Purpose:** Form, sequence, and drive the specific changes the business will make — the unit of transformation.
- **Primary Users:** Strategist (commits), Operations Manager (drives).
- **Inputs:** Recommendations, insights, evidence, prioritization.
- **Outputs:** Committed moves with intent, expected outcome, and status through execution.
- **Dependencies:** Approvals, Orchestrations, Guard/transition rules.
- **Connected Modules:** Insights, Approvals, Orchestrations, Measurement, Deliverables.
- **Success Metrics:** Execution completion rate; move cycle time; share reaching a measured outcome.
- **Future Expansion:** Move templates; a marketplace of proven moves; dependency-aware sequencing.

### 6. Orchestrations
- **Purpose:** Automate the mechanical progression of work and keep records current — without making decisions.
- **Primary Users:** Operations Manager (configures/monitors); the system (runs).
- **Inputs:** Approved moves, defined stages, triggers.
- **Outputs:** Advanced work, triggered steps, updated state.
- **Dependencies:** Integrations, Workflow Intelligence, Observability.
- **Connected Modules:** Moves, Execution, Notifications.
- **Success Metrics:** Orchestration health (success vs. failed runs); manual-effort reduction; time saved.
- **Future Expansion:** Richer automation library; conditional flows; external-system actions.

### 7. Transformation Index
- **Purpose:** Measure compounding transformation progress over time.
- **Primary Users:** Strategist, Business Owner, Executive.
- **Inputs:** Completed moves, Measurement, Learning.
- **Outputs:** A headline trajectory of improvement per client.
- **Dependencies:** Measurement, Business Intelligence Engine.
- **Connected Modules:** Business Health, Reports & Analytics, Client Portal.
- **Success Metrics:** Index reflects real, verifiable improvement; client trust in the measure.
- **Future Expansion:** Benchmarking against peers; forecasted trajectory; sub-indices per dimension.

### 8. Business Health
- **Purpose:** Present the current-state read of a business across operational dimensions.
- **Primary Users:** Strategist, Business Owner, Executive.
- **Inputs:** Business Scan, Measurement results.
- **Outputs:** A dimensional health picture that frames priorities.
- **Dependencies:** Business Scan, Business Intelligence Engine.
- **Connected Modules:** Business Scan, Signals, Transformation Index, Reports.
- **Success Metrics:** Health accuracy; correlation between health movement and real outcomes.
- **Future Expansion:** Real-time health from live integrations; configurable dimensions.

### 9. Conversation Workspace
- **Purpose:** Hold the threaded dialogue, context, and decisions between team and client in one place.
- **Primary Users:** Strategist, Business Owner, Client, Operations Manager.
- **Inputs:** Messages, shared context, linked signals/moves/files, internal notes.
- **Outputs:** A durable, accountable record of discussion and agreement.
- **Dependencies:** Authorization (internal vs. client scope), Notifications, Storage.
- **Connected Modules:** Approvals, Files, Meetings, Moves, Conversation Intelligence.
- **Success Metrics:** Response times; decisions reached in-thread; client engagement.
- **Future Expansion:** Richer context linking; multi-party threads; assistant-summarized threads.

### 10. Strategist Workspace
- **Purpose:** Give the Strategist a single environment to plan, review, and steer a client's transformation.
- **Primary Users:** Strategist.
- **Inputs:** Client context, recommendations, moves, business health, conversations.
- **Outputs:** Plans, endorsed recommendations, approvals, proposals.
- **Dependencies:** Recommendation Engine, Proposal Generation, Approvals.
- **Connected Modules:** Conversation Workspace, Moves, Proposals/Billing, Reports.
- **Success Metrics:** Strategist responsiveness; recommendation acceptance; client outcomes per strategist.
- **Future Expansion:** Cross-client planning; strategist analytics; guided playbooks.

### 11. Client Portal
- **Purpose:** Provide the customer a clear, trustworthy window into their own transformation.
- **Primary Users:** Business Owner, Client.
- **Inputs:** The client's own health, progress, deliverables, approvals, billing, conversations.
- **Outputs:** A calm, scoped client experience.
- **Dependencies:** Authorization (strict client scoping / RLS), Notifications.
- **Connected Modules:** Transformation Index, Deliverables, Approvals, Files, Conversation, Billing, Support.
- **Success Metrics:** Client confidence; approval turnaround; engagement at required decisions.
- **Future Expansion:** White-label; portfolio views for multi-entity clients; mobile companion.

### 12. Approvals
- **Purpose:** Record explicit human authorization of consequential change — the accountability gate.
- **Primary Users:** Strategist, Business Owner (and authorized Clients).
- **Inputs:** A move, contract, deliverable, or decision requiring authorization.
- **Outputs:** An auditable authorization record naming who approved and when.
- **Dependencies:** Authorization, Audit Logs.
- **Connected Modules:** Moves, Deliverables, Billing/Contracts, Conversation.
- **Success Metrics:** Approval turnaround; completeness of the audit trail; zero unauthorized consequential actions.
- **Future Expansion:** Delegated approval; conditional/threshold approvals; multi-party sign-off.

### 13. Deliverables
- **Purpose:** Manage the outputs produced for a client and their review lifecycle.
- **Primary Users:** Operations Manager, Strategist, Client (reviews).
- **Inputs:** Work products, project scope, review states.
- **Outputs:** Delivered, approved outputs with version history.
- **Dependencies:** Files, Version History, Approvals.
- **Connected Modules:** Projects/Moves, Files, Approvals, Client Portal.
- **Success Metrics:** On-time delivery; revision cycles; client approval rate.
- **Future Expansion:** Deliverable templates; automated quality checks; richer review tooling.

### 14. Files
- **Purpose:** Hold the shared documents and artifacts of the work, scoped by access.
- **Primary Users:** Strategist, Operations Manager, Client (scoped).
- **Inputs:** Uploaded and generated artifacts.
- **Outputs:** Referenced evidence and deliverable materials with controlled access.
- **Dependencies:** Storage, Authorization, Version History.
- **Connected Modules:** Deliverables, Conversation, Document Intelligence, Projects.
- **Success Metrics:** Access correctness (no leakage); retrieval speed; storage integrity.
- **Future Expansion:** Deeper document intelligence; structured extraction; retention policies.

### 15. Meetings
- **Purpose:** Capture the synchronous touchpoints in the relationship and their outcomes.
- **Primary Users:** Strategist, Business Owner, Client.
- **Inputs:** Scheduling, agendas, outcomes.
- **Outputs:** Shared context and follow-on moves or approvals.
- **Dependencies:** Notifications, Integrations (calendar).
- **Connected Modules:** Conversation Workspace, Signals, Moves.
- **Success Metrics:** Meeting-to-action conversion; scheduling friction; follow-up completion.
- **Future Expansion:** Meeting intelligence (notes, action extraction); scheduling automation.

### 16. Reports & Analytics
- **Purpose:** Communicate state, progress, and results across clients and time.
- **Primary Users:** Strategist, Executive, Platform Administrator.
- **Inputs:** Business Health, Transformation Index, Measurement, Moves, engagement data.
- **Outputs:** Legible summaries and analyses of transformation and outcomes.
- **Dependencies:** Business Intelligence Engine, Audit Logs.
- **Connected Modules:** Business Health, Transformation Index, Moves, Client Portal.
- **Success Metrics:** Decision usefulness; accuracy; adoption by strategists and clients.
- **Future Expansion:** Custom reports; benchmarking; scheduled/automated reporting.

### 17. Billing & Subscription
- **Purpose:** Manage the commercial relationship — proposals, contracts, invoices, and payment.
- **Primary Users:** Strategist (owns commercial authority), Business Owner (authorizes), Platform Administrator.
- **Inputs:** Proposals, contracts, pricing, payment events.
- **Outputs:** Executed agreements, invoices, settlement, activation.
- **Dependencies:** Approvals, Integrations (payment, e-sign), Audit Logs.
- **Connected Modules:** Strategist Workspace, Approvals, Client Portal.
- **Success Metrics:** Proposal-to-signature time; billing accuracy; settlement reliability.
- **Future Expansion:** Subscription plans; usage-based billing; self-serve tiers.

### 18. Settings & Configuration
- **Purpose:** Configure the workspace, roles, integrations, and system behavior.
- **Primary Users:** Platform Administrator.
- **Inputs:** Configuration, permissions, integration credentials, provider selection.
- **Outputs:** Governed system behavior.
- **Dependencies:** Authentication, Authorization, Audit Logs.
- **Connected Modules:** Cross-cutting — governs all modules.
- **Success Metrics:** Configuration correctness; least-privilege adherence; auditability of changes.
- **Future Expansion:** Granular policy controls; environment templates; org-level governance.

---

## AI Modules

AI-native modules are documented separately because they share a common boundary: **every AI module
observes, analyzes, and produces — it never decides or executes consequentially.** Each proposes to a
human under the Human + AI contract (`02-product-philosophy.md`, `07-user-journeys.md` §Journey 6). The
Auxiliary is composed of these engines.

- **Recommendation Engine.** *Purpose:* turn insights into proposed moves with reasoning, evidence, and
  confidence. *Boundary:* proposes moves; a Strategist commits and approves. Never creates or approves
  a move itself.
- **Business Intelligence Engine.** *Purpose:* model the state of the business — powering Business Scan,
  Health, and Signals. *Boundary:* computes understanding; it does not act on it.
- **Prediction Engine.** *Purpose:* forecast likely outcomes and surface risks, always with confidence
  and reasoning. *Boundary:* predicts; it never treats a prediction as a decision.
- **Knowledge Engine.** *Purpose:* organize and retrieve the accumulated knowledge of the business and
  the platform to ground insights and answers. *Boundary:* informs; it does not assert unsourced claims.
- **Summarization Engine.** *Purpose:* condense conversations, evidence, and history into faithful
  summaries. *Boundary:* summarizes without distortion; it never invents content.
- **Proposal Generation.** *Purpose:* draft proposals from diagnosed needs and configured plans.
  *Boundary:* drafts for a Strategist to review, price, own, and send. Never sends or prices on its own.
- **Document Intelligence.** *Purpose:* read and structure the content of files as evidence.
  *Boundary:* extracts and organizes; it does not act on documents.
- **Conversation Intelligence.** *Purpose:* understand and assist within conversations — surfacing
  context, drafting replies, extracting actions. *Boundary:* assists the human in the thread; it never
  speaks or commits as the human.
- **Workflow Intelligence.** *Purpose:* make orchestration smarter — suggesting steps, spotting stalls,
  optimizing sequences. *Boundary:* advises orchestration; consequential moves still require approval.

The shared rule: these engines make people faster and better-informed. None crosses an approval gate,
and none executes a business-critical action silently.

---

## Platform Services

Platform services are the **foundational capabilities that support modules but are not themselves
user-facing modules.** Users work in modules; modules stand on services. Documented so their ownership
is clear and unduplicated.

- **Authentication.** Establishes verified identity (sessions, secure sign-in). Every module trusts it; none re-implements it.
- **Authorization.** Enforces who may do what, in what scope — the permission model and row-level scoping (`12-security-and-permissions.md`). The single source of access truth.
- **Notifications.** Delivers timely, relevant alerts across modules without each module inventing its own.
- **Audit Logs.** Records consequential actions and approvals immutably — the substrate of accountability.
- **Search.** Finds entities and content across the platform, scoped by authorization.
- **Storage.** Persists files and artifacts reliably and securely.
- **Version History.** Tracks changes to documents and deliverables over time.
- **Integrations.** Connects external systems — payment, e-sign, automation, calendar, data sources — behind consistent contracts.
- **API Layer.** The programmatic surface through which modules and external systems interact under one contract.
- **Observability.** Monitors system and integration health so the platform stays reliable and issues are caught early.

Because these are services, not modules, a change to one benefits every module uniformly, and no module
owns identity, access, or storage privately. That is what keeps the platform consistent and secure.

---

## Module Relationships

Modules connect through the transformation cycle and the client entity, not through ad-hoc coupling.
The primary spine:

```
   Business Scan
        ↓
      Signals
        ↓
     Insights
        ↓
       Moves
        ↓
    Approvals
        ↓
    Execution (Orchestrations + Deliverables)
        ↓
   Measurement
        ↓
 Transformation Index  →  Business Health  →  (feeds next Signals)
```

Around that spine, the collaborative and commercial modules interweave:

- **Conversation Workspace** runs alongside the whole spine — most **Moves** and **Approvals** are
  discussed and agreed there, and it links to **Files** and **Meetings**.
- **Files** attach wherever evidence lives — Conversations, Deliverables, Projects — and are read by
  **Document Intelligence**.
- **Meetings** feed **Signals** and produce follow-on **Moves** and **Approvals**.
- **Reports & Analytics** draw from **Business Health**, the **Transformation Index**, and
  **Measurement** to communicate progress to Strategists and clients.
- **Billing & Subscription** depends on **Approvals** (a client authorizes proposals/contracts) and
  surfaces in the **Client Portal**; its consequential steps route to the **Strategist**.
- **Strategist** works through the **Strategist Workspace**, endorsing recommendations into **Moves**
  and granting **Approvals**.
- **Client Portal** is the client's view onto **Transformation Index**, **Deliverables**, **Approvals**,
  **Files**, **Conversation**, and **Billing** — the same truth, scoped and simplified.

Every connection is a defined seam, not a tangle. A module reads and writes across its documented
Connected Modules and nowhere else.

---

## Module Boundaries

Each module **owns one responsibility completely and does not reach into another's**. Clear examples of
where lines are drawn:

- **Signals** owns detection and triage; **Insights** owns interpretation; **Moves** owns the committed
  change. A signal is not an insight, and an insight is not a move — three responsibilities, three
  modules.
- **Approvals** owns authorization; **Moves** owns the change being authorized. Approval logic lives in
  one place, so every consequential path is gated identically.
- **Orchestrations** owns mechanical automation; **Deliverables** owns produced outputs. Execution is
  split by *kind* of work, not merged into one ambiguous "execution" blob.
- **Files** owns artifacts; **Deliverables** owns the review lifecycle of outputs; **Document
  Intelligence** owns reading them. Storage, lifecycle, and comprehension are distinct.
- **Business Health** owns current state; **Transformation Index** owns movement over time. Snapshot and
  trajectory never merge.
- **Authorization** (a service) owns access; no module implements its own permissions.

**Why clear ownership matters:** unambiguous boundaries are what make the platform scalable,
maintainable, and productive to build on. When one module owns a responsibility, a change to that
responsibility happens in one place; a bug has one home; a new capability has an obvious owner; and two
teams never build the same thing twice. Overlap, by contrast, breeds duplication, inconsistency, and
fear of change. Boundaries are not bureaucracy — they are how a large system stays comprehensible.

---

## Future Modules

The following are intentionally reserved for future releases and deliberately **not** specified here.
They are listed so the architecture can anticipate them, not so they can be built early.

- **Marketplace** — a catalog of proven moves, orchestrations, and services.
- **Benchmarking** — comparison of a business against peers and industry norms.
- **Knowledge Marketplace** — shareable, reusable transformation knowledge and playbooks.
- **Voice Operations** — voice as a modality over existing capabilities.
- **Mobile Companion** — a focused mobile surface of the existing layers.
- **Partner Portal** — a scoped surface for external partners and consultants.
- **Enterprise Governance** — multi-entity hierarchy, advanced roles, and controls.
- **Custom AI Auxiliaries** — client- or domain-specialized intelligences.
- **API Marketplace** — third-party extensions on the API Layer.

**Why they can be added without restructuring:** each plugs into an existing seam — the transformation
cycle, the client entity, the surfaces, the platform services, or Settings (as detailed in
`05-information-architecture.md` §Scalability). A Marketplace is a new source of Recommendations and
Orchestrations; Benchmarking is a new view on the Transformation Index; a Partner Portal is a new scope
in Authorization; Custom Auxiliaries are new AI modules under the same non-decision boundary. Because
modules communicate through defined contracts rather than tangled coupling, a new module attaches at a
seam without forcing changes to existing modules. That is the test for any future module: **it must fit
an existing seam, or this chapter is revised deliberately to admit it.**

---

## Module Principles

These principles govern how modules are defined, built, and evolved. A design that violates one is
corrected, or this chapter is changed deliberately.

1. **One responsibility per module.** Each module owns exactly one clear responsibility. If a module
   does two things, it is two modules.
2. **Modules communicate through defined contracts.** Interaction happens across documented seams
   (Connected Modules), never through hidden coupling or reaching into another module's internals.
3. **Modules evolve independently.** A module can change internally without forcing changes elsewhere,
   as long as its contracts hold. Independent evolution is what keeps the platform buildable.
4. **No duplicated capability.** A responsibility lives in exactly one module or service. Two modules
   never implement the same thing; shared needs become a service.
5. **Operational context before isolated functionality.** A module earns its place by contributing to
   the transformation cycle, not by being an interesting feature in isolation.
6. **Services support; modules serve users.** Foundational capabilities (auth, storage, audit) are
   services every module stands on; modules are the user-facing capabilities. The two never blur.
7. **AI modules propose; they never decide.** Every AI module observes, analyzes, and produces under the
   Human + AI contract. None crosses an approval gate or executes consequentially in silence.
8. **Approvals are centralized.** Authorization of consequential change lives in one module, so every
   consequential path is gated identically and auditable.
9. **Boundaries are explicit and defended.** Where one module ends and another begins is documented and
   respected. Ambiguity at a boundary is a defect to resolve, not a gray area to live in.
10. **New capability enters through seams.** Modules are added by attaching to existing seams — the
    cycle, the client entity, the surfaces, the services — never by restructuring what exists.
11. **Every module is measurable.** A module carries success metrics tied to real outcomes, so we can
    tell whether it is doing its job rather than merely existing.
12. **The catalogue is canonical.** No module ships without an entry here, defined by the framework.
    Adding or changing a module is a change to this chapter first.
