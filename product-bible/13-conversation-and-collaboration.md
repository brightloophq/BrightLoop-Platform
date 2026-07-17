# 13 · Conversation & Collaboration

Status: Draft
Owner: Auxion Product Team
Last updated: 2026-07-17

Purpose:
Defines how clients and the Auxion team communicate and collaborate within the product.

---

> This chapter is the **constitutional document governing collaboration inside Auxion**. It is
> implementation-independent: it does not describe messaging technologies, real-time transports,
> notification systems, or chat frameworks. It defines how humans, AI, and operational work collaborate
> across the platform. Terms are canonical per `03-product-dna.md`; entities per `09-data-architecture.md`.
> **Conversation is not a feature — it is operational infrastructure.** When the collaboration model
> changes, this chapter changes first (see the prime rule in `README.md`).

---

## Introduction

Traditional chat systems fail businesses because they treat communication as an end in itself. Messages
accumulate in a stream that is disconnected from the decisions, projects, approvals, files, and
execution they concern. A decision made in a thread is lost the moment the thread scrolls away; an
agreement reached in chat has to be manually re-entered somewhere "real" to have any operational effect;
and the reasoning behind a choice evaporates because it lived in a message no one will ever find again.
The result is the familiar failure mode: a great deal of talking that produces very little traceable
progress, and a permanent gap between what was *discussed* and what was *done*.

Auxion treats conversation differently: **conversation is operational context.** A discussion is not a
side channel to the work — it is part of the work. When a strategist and a client agree on a move in a
conversation, that conversation is connected to the move it produced, the evidence it weighed, the
approval it required, and the outcome it drove. Nothing has to be re-entered, because the discussion and
the operational record are the same fabric.

From this follows the standard for every conversation in Auxion: **every meaningful discussion should
contribute to business transformation.** A conversation is doing its job when it moves the business
forward — when it produces a decision, a move, an approval, or captured knowledge — not merely when
messages are exchanged. The chapters below define how collaboration is built to produce operational
progress rather than isolated communication.

---

## Collaboration Philosophy

Collaboration in Auxion is guided by a fixed set of qualities. It should be:

- **Contextual.** Every conversation carries the operational context it concerns — the client, the move,
  the evidence — so discussion happens with the facts present, not divorced from them.
- **Persistent.** Conversations and their outcomes endure. What was decided and why remains findable long
  after the discussion, as durable operational memory.
- **Transparent.** Who said what, who decided what, and on what basis is visible to those entitled to see
  it. Collaboration is legible, not opaque.
- **Action-oriented.** Discussion is oriented toward producing operational outcomes — a move, an approval,
  a captured lesson — not toward conversation for its own sake.
- **Traceable.** Every consequential outcome of a conversation is connected to the operational objects it
  produced and recorded in the audit trail.
- **Inclusive.** The right people are present for the decisions that need them, and collaboration reaches
  across the internal team and the client together.
- **Respectful.** Collaboration honors people's time, attention, and boundaries — the right context to the
  right person at the right moment, never noise.
- **Outcome-focused.** Success is measured by the transformation the collaboration produced, not by the
  volume of communication.

**Why this matters:** a conversation that ends in a shared understanding but changes nothing operational
has, in Auxion's terms, mostly failed. Collaboration exists to move the business, and the platform is
built so that the natural output of a good discussion is operational progress — a decision made, a move
created, an approval granted, knowledge captured — rather than a thread that scrolls into oblivion.

---

## Conversation Workspace

The **Conversation Workspace** is a shared operational environment, not a messaging application. A
messaging app gives you a stream of text; a Conversation Workspace gives you a *place* where a discussion
and everything it concerns live together, so that talking and doing are one continuous act
(`05-information-architecture.md` on workspaces vs. pages).

A Conversation connects to the operational fabric around it:

- **Clients** — every conversation belongs to a client; it is scoped to their business.
- **Projects** — discussions link to the sustained work they concern.
- **Moves** — a conversation can produce, reference, and track the moves it decides.
- **Signals** — a detected change can surface into a conversation for interpretation.
- **Business Scans** — the diagnostic that frames what a conversation is about.
- **Meetings** — synchronous touchpoints attach to and extend the conversation.
- **Approvals** — many approvals are requested and granted in-context, within the conversation.
- **Deliverables** — discussion of outputs links to the deliverables themselves and their review.
- **Files** — artifacts and evidence attach where the discussion needs them.
- **Knowledge Assets** — captured knowledge is drawn from and fed back into conversations.
- **Recommendations** — the Auxiliary's proposals appear in context for human review.
- **Transformation Progress** — a conversation is set against the client's health and index, so
  discussion happens with progress visible.

Because the Conversation Workspace holds the discussion *and* its operational context together, a person
can read the thread, see the linked move, review the evidence, and grant the approval without leaving —
which is precisely what turns conversation into operational infrastructure rather than a chat box.

---

## Conversation Lifecycle

A conversation moves through a defined lifecycle from creation to archive:

1. **Conversation Created.** A conversation begins around a client, a topic, or a signal — establishing a
   scoped, shared space with its operational context attached.
2. **Discussion.** People exchange messages, share context, and work toward understanding. This is the
   human core of the conversation.
3. **AI Assistance.** The Auxiliary supports the discussion in-context — summarizing, retrieving
   knowledge, surfacing risks, drafting — always as an aid to the people, never as a participant with
   authority.
4. **Decision.** The discussion reaches a decision. This is the pivot from talking to acting — the point a
   conversation earns its purpose.
5. **Action Creation.** The decision produces operational objects — a move, a task, a meeting — created
   directly from the conversation, so intent becomes structured work.
6. **Approval.** Where the action is consequential, it passes through an explicit human approval, often
   requested and granted within the conversation.
7. **Execution.** The approved work is carried out (via Orchestration and delivery), with the conversation
   remaining connected to its progress.
8. **Resolution.** The conversation reaches closure — its question answered, its decision executed, its
   purpose fulfilled.
9. **Knowledge Capture.** The durable value of the conversation — the decision, the reasoning, the lesson —
   is captured so it survives beyond the thread (see Knowledge Capture).
10. **Archive.** The conversation is archived, preserved immutably as part of the operational record. It is
    never destroyed; its history remains part of the business's memory.

Two rules hold across the lifecycle: **conversations are oriented toward producing action**, and **their
operational history is never lost.** A conversation that reaches Resolution has produced something the
business can point to; a conversation that is archived remains permanently retrievable.

---

## Human Collaboration

Different personas collaborate with different responsibilities, expectations, and styles — but always
within one shared, accountable fabric.

- **Business Owner.** *Responsibility:* direct their business and authorize what is theirs. *Expectation:*
  a clear, high-signal channel to their Strategist and the decisions that need them. *Style:* concise,
  outcome-oriented, respectful of their scarce attention.
- **Operations Manager.** *Responsibility:* drive execution and coordinate delivery. *Expectation:* clarity
  on what is decided and what needs doing. *Style:* practical and specific, focused on moving work.
- **Strategist.** *Responsibility:* own the client relationship and the strategic discussion. *Expectation:*
  to guide the conversation, frame decisions, and build trust. *Style:* calm, expert, honest — the human
  face of Auxion, keeping internal notes internal and the client thread clear.
- **Client.** *Responsibility:* participate and act on what is theirs. *Expectation:* a simple, trustworthy
  line to the team without operational machinery. *Style:* plain and welcoming, no jargon.
- **Platform Administrator.** *Responsibility:* govern collaboration — permissions, retention, and the
  integrity of the record. *Expectation:* visibility into governance, not into the substance of client
  discussions beyond their remit. *Style:* oversight, not participation.

Across all personas, one boundary is constant: **internal-only discussion never leaks to the client.** The
Conversation Workspace supports internal notes that the team uses to coordinate, distinct from the
client-facing thread, and the wall between them is enforced structurally (`12-security-and-permissions.md`),
not left to discipline.

---

## AI Collaboration

The Auxiliary participates in conversations as a bounded assistant. It **may**:

- **Summarize discussions** — condense long threads into faithful summaries.
- **Draft replies** — prepare responses for a human to review, edit, and send as their own.
- **Retrieve knowledge** — surface relevant history, evidence, and knowledge assets.
- **Suggest Moves** — propose moves the discussion implies, with reasoning and confidence.
- **Recommend meetings** — suggest a synchronous touchpoint when discussion warrants it.
- **Generate proposals** — draft proposals from the conversation for a Strategist to own.
- **Identify risks** — surface risks a discussion touches on but has not named.
- **Track unanswered questions** — notice what has been asked but not resolved.
- **Generate action items** — extract the actions a conversation implies for human confirmation.

The Auxiliary **must never**:

- **Pretend to be human.** Its contributions are always clearly attributable to the Auxiliary. It never
  poses as a person or speaks as one.
- **Commit to business decisions.** It proposes; it never decides or agrees on the business's behalf.
- **Override approvals.** It never crosses an approval gate or proceeds past one.
- **Hide uncertainty.** It always surfaces its confidence and what it does not know.
- **Modify operational history.** It never edits or rewrites the record of what was said or decided. History
  is immutable to AI exactly as it is to people.

This keeps AI a genuine collaborator — one that makes the humans faster and better-informed — without ever
becoming a participant who decides, misrepresents, or rewrites the record.

---

## Operational Objects

Conversations **create and reference operational objects**, which is what makes them part of the
operational record rather than isolated text. Objects a conversation may produce or link to include:

- **Move** — a committed change decided in the conversation.
- **Task** — a discrete unit of work to be done.
- **Meeting** — a synchronous touchpoint scheduled from the discussion.
- **Proposal** — a commercial offer drafted and discussed.
- **Contract** — an agreement referenced and progressed.
- **Deliverable** — an output discussed and reviewed.
- **Approval** — an authorization requested and granted in-context.
- **Knowledge Asset** — a durable lesson captured from the discussion.
- **Business Scan** — a diagnostic referenced or initiated.
- **Signal** — a change surfaced into the conversation.
- **Recommendation** — an AI proposal presented for review.

**How conversations become part of the operational record:** when a conversation produces an object, that
object is a first-class entity in the domain model, linked back to the conversation that created it and
recorded in the audit trail. The move remembers the conversation that decided it; the approval remembers
the discussion that requested it. This bidirectional link is what dissolves the traditional gap between
"what we talked about" and "what we did" — in Auxion they are connected by construction. A conversation is
therefore not a transcript to be mined later; it is a live part of the operational fabric, and its
consequential outputs are permanent, traceable entities.

---

## Collaboration Governance

Collaboration is governed to keep it accountable, scoped, and respectful:

- **Permissions.** Who may see and participate in a conversation is bounded by role and scope
  (`12-security-and-permissions.md`). Client conversations are scoped to their client; internal notes are
  internal.
- **Visibility.** Every participant sees exactly what they are entitled to and no more. The internal/client
  boundary is enforced structurally.
- **Mentions.** People can be brought into a discussion deliberately, drawing the right person to the right
  context.
- **Ownership.** Every conversation has a responsible owner (typically the Strategist) accountable for its
  conduct and outcomes.
- **Assignment.** Work and conversations can be assigned to the responsible person, making ownership
  explicit.
- **Escalation.** When a discussion exceeds someone's authority or stalls, it escalates to the accountable
  role.
- **Conflict resolution.** Disagreements are resolved by the accountable owner, on the record, rather than
  left ambiguous.
- **Notification preferences.** People control how and when they are notified, so collaboration reaches
  them without becoming noise.
- **Retention.** Conversations are retained per policy and preserved as operational history; consequential
  records are never quietly discarded.
- **Auditability.** Consequential collaboration actions — decisions, approvals, assignments — are recorded
  immutably. The collaboration record is part of the audit trail.

Governance here serves the same end as everywhere in Auxion: collaboration is powerful *and* accountable,
open to the right people *and* closed to the wrong ones, permanent in its record *and* respectful of
attention.

---

## Meeting Collaboration

Meetings are the synchronous extension of collaboration, integrated into the same operational fabric
rather than happening off to the side:

- **Preparation.** A meeting is set up with its purpose and context attached, drawn from the conversation
  and the client's state.
- **Agenda.** A clear agenda focuses the meeting on the decisions and topics that need synchronous
  attention.
- **AI briefing.** The Auxiliary can prepare a briefing — summarizing context, surfacing open questions
  and risks — so participants arrive informed.
- **Live notes.** The substance of the meeting is captured as it happens, becoming part of the record.
- **Action extraction.** The actions a meeting produces are extracted into operational objects — moves,
  tasks, follow-ups — rather than lost in notes.
- **Decision capture.** Decisions made in the meeting are recorded as decisions, connected to the objects
  they produce.
- **Follow-up.** The meeting's outcomes feed back into the conversation and the work, closing the loop.
- **Knowledge preservation.** The durable value of the meeting is captured as knowledge that survives it.

A meeting in Auxion is therefore not an event that happens and disappears; it is a touchpoint whose
outcomes become traceable operational objects and preserved knowledge, connected to everything around it.

---

## Knowledge Capture

Conversations and meetings are where much of a business's most valuable knowledge is created — and
traditionally, where it is lost. Auxion turns that flow of discussion into durable **organizational
knowledge**. What is captured includes:

- **Important decisions** — what was decided, by whom, and why, so the reasoning survives.
- **Lessons learned** — what worked and what did not, so mistakes are not repeated.
- **Frequently asked questions** — recurring questions and their answers, so they are answered once.
- **Best practices** — approaches proven to work, made reusable.
- **Policies** — the rules and constraints agreed for a client or the platform.
- **Client preferences** — how a particular client wants to work, remembered across the relationship.
- **Historical context** — the story of how the business got to where it is.
- **Knowledge Assets** — the curated, structured, reusable knowledge these feed into.

**Why this matters:** knowledge that lives only in a person's memory or a buried thread is knowledge the
business will lose — when someone leaves, when a thread scrolls away, when a year passes. Capturing it as
durable Knowledge Assets means the business's understanding of itself compounds instead of evaporating,
and it means the Auxiliary has faithful context to reason over (`10-ai-architecture.md`). Knowledge
capture is how a conversation's value outlives the conversation — the difference between a business that
learns and one that keeps relearning.

---

## Collaboration Principles

These principles govern all collaboration. A design that violates one is corrected, or this chapter is
changed deliberately.

1. **Conversations produce action.** A conversation succeeds when it moves the business — a decision, a
   move, an approval, captured knowledge — not merely when messages are exchanged.
2. **Context beats volume.** The value of collaboration is in the context it carries and the outcomes it
   produces, not the amount said. We optimize for signal, never for activity.
3. **Discussion and operation are one fabric.** Conversation is connected to the work it concerns by
   construction, so there is no gap between what was discussed and what was done.
4. **Knowledge survives the conversation.** The durable value of a discussion is captured as knowledge that
   outlives the thread. Nothing important is allowed to evaporate.
5. **Operational history never disappears.** Conversations and their consequential outcomes are preserved
   immutably. History is archived, never destroyed or rewritten.
6. **The internal/client wall is absolute.** Internal discussion never leaks to the client; the boundary is
   enforced structurally, not by discipline.
7. **AI supports, never impersonates or decides.** The Auxiliary makes people faster and better-informed,
   always clearly attributable, never posing as human, never crossing an approval gate.
8. **Every conversation has an owner.** A responsible person is accountable for each conversation's conduct
   and outcomes. There is no ownerless collaboration.
9. **The right people, at the right moment.** Collaboration is inclusive of who a decision needs and
   respectful of everyone's attention — reach, not noise.
10. **Consequential collaboration is auditable.** Decisions, approvals, and assignments made in
    collaboration are recorded immutably, part of the accountable record.
11. **Meetings produce objects, not just notes.** Synchronous touchpoints yield traceable operational
    objects and preserved knowledge, connected to the work.
12. **Collaboration is scoped by responsibility.** Who can see and act in a conversation follows the same
    responsibility-based, least-privilege model as everything else in Auxion.

---

## Future Evolution

The collaboration architecture is built so new modes and participants attach to the existing
Conversation Workspace and operational fabric rather than forcing a redesign, because collaboration is
defined as *contextual, action-producing, traceable operation* — not as any particular channel:

- **Voice conversations** — a new modality over the existing conversation model; voice becomes another way
  to contribute to the same fabric.
- **Video meetings** — richer synchronous touchpoints within the existing Meeting integration; outcomes
  still become operational objects.
- **Live collaboration** — real-time co-presence over the same workspace; a richer channel, not a new
  structure.
- **External guests** — scoped, time-bounded, audited participation from outside, governed by the existing
  permission model.
- **Partner organizations** — cross-organization collaboration under the same isolation and permission
  rules.
- **Enterprise collaboration** — deeper hierarchy and controls extending the existing governance.
- **Mobile collaboration** — the same fabric on a mobile surface, following the responsive philosophy.
- **Shared workspaces** — broader shared operational environments built on the workspace concept.
- **AI co-workers** — more capable Auxiliaries collaborating in-context under the same non-decision,
  non-impersonation contract.
- **Future communication technologies** — whatever comes next attaches as a new channel into the same
  operational fabric.

The test for any collaboration advance is constant: **it must produce contextual, traceable operational
progress within the existing fabric — attaching at a defined seam — or the model (this chapter) is revised
deliberately, in the open, before it ships.** Because Auxion's collaboration is defined by what it *does
for transformation* rather than by any channel, the platform can adopt any communication technology of any
era without ever letting conversation drift back into disconnected chatter.
