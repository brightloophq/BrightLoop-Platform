# 07 · User Journeys

Status: Draft
Owner: Auxion Product Team
Last updated: 2026-07-17

Purpose:
Maps the end-to-end paths users take through Auxion and the moments that matter along them.

---

> This chapter defines Auxion's **operational journey architecture** — how each persona moves through
> the product to produce a real business outcome. It is not a UI specification and not a wireframe; it
> describes the shape and intent of the journeys, not their pixels. Personas are those from
> `06-user-personas.md`; the cycle is that of `02-product-philosophy.md`; terms are canonical per
> `03-product-dna.md`. When a journey changes, this chapter changes first (see the prime rule in
> `README.md`).

---

## Introduction

Auxion is **journey-driven, not feature-driven.** A feature-driven product organizes itself around
what it can do and leaves the user to assemble those capabilities into progress. A journey-driven
product organizes itself around what the user is trying to *achieve* and makes the features serve that
arc.

Users do not come to Auxion to click buttons. They come to solve business problems and drive
transformation. Nobody opens Auxion wanting to "use the Moves module"; they open it because something
in their business needs to change and they want to know what to do and get it done. The product's job
is to carry them from that need to a measurable result with as little friction and as much confidence
as possible.

This has a hard consequence for how we design: **every journey must end in measurable progress.** A
journey that ends in activity without an outcome — a screen viewed, a form filled, a report generated
— has failed the user even if every feature worked. The test of any journey is not whether it
functioned but whether it moved the business. The journeys below are designed so that each one closes
on a real, measurable step forward.

---

## Journey 1 — Client Onboarding

*Primary persona: Business Owner · Supporting: Strategist, Auxiliary*

The path from a prospective business to an active, diagnosed client ready to transform. Onboarding
must convert uncertainty into a clear baseline and a first set of moves.

**The arc:**

1. **Discovery.** The business encounters Auxion and expresses interest. Auxion begins learning who
   they are and what they need.
2. **Business Profile.** Basic context about the business is captured — its shape, market, and
   situation — enough to make the assessment meaningful.
3. **Initial Assessment.** A structured set of questions gathers the raw signals of the business's
   current state.
4. **Business Scan.** The assessment is turned into a structured diagnostic across defined operational
   dimensions — the honest read of where the business stands.
5. **Transformation Baseline.** The scan produces the starting Business Health and the zero point of
   the Transformation Index, against which all future progress is measured.
6. **Strategist Assignment.** An accountable human partner is assigned — the client's guide and the
   owner of the relationship.
7. **Workspace Creation.** The client's environment is established: their Portal, Conversation, and the
   place their transformation will live.
8. **Welcome Experience.** The client is oriented calmly — shown their baseline, introduced to their
   Strategist, and told what happens next. First impressions set the tone of trust.
9. **First Recommended Moves.** The system and Strategist surface the initial high-impact moves, with
   reasoning attached, so onboarding ends pointing at action, not at a blank workspace.

**Success criteria:** the client has an honest baseline, an assigned Strategist, a working Portal, and
at least one clear recommended move they understand — reached quickly enough to preserve momentum.

**Decision points:** whether the profile is complete enough to scan; whether the baseline is
trustworthy; which Strategist fits; which first moves to surface.

**Potential failure points:** an assessment too long or abstract to complete; a baseline that feels
generic or wrong (destroying trust immediately); a cold, mechanical welcome; ending onboarding with no
clear next move. Each is a place the journey can lose the client, and each is designed against.

---

## Journey 2 — Business Transformation

*Primary personas: Strategist, Operations Manager, Business Owner · Supporting: Auxiliary*

The continuous operational cycle — the core loop the whole product exists to turn. This is not a
one-time journey; it repeats for the life of the relationship. Each stage exists for the reason given
in `02-product-philosophy.md`; here is what *happens* at each.

1. **Signal Detection.** A change worth attention is detected — from monitoring, measurement, or the
   Auxiliary's observation. The cycle always begins from something real.
2. **Evidence Collection.** The facts around the signal are gathered so any interpretation rests on
   data the user can inspect.
3. **Insight Generation.** The signal and its evidence are interpreted into meaning — what is
   happening, why it matters, what is at stake — qualified by a stated confidence.
4. **Recommendation.** The Auxiliary proposes a move, with reasoning and expected outcome, giving the
   Strategist a well-formed option rather than a blank page.
5. **Move Creation.** A Strategist commits the recommendation (adjusted as their judgment dictates)
   into a move with a defined intent and a measurable target.
6. **Approval.** An accountable human authorizes the move. Nothing consequential proceeds without this
   gate, and the record names who granted it.
7. **Execution.** The approved move is carried out as governed work — scoped, staged, owned, and
   advanced by Orchestration where the steps are mechanical.
8. **Measurement.** The move's result is measured against what it promised, making success and failure
   equally visible.
9. **Learning.** The measured result is captured and fed back into the business's understanding of
   itself, so the next cycle is smarter.
10. **Transformation Index Update.** Verified progress rolls up into the Transformation Index and
    updates Business Health — the business's improvement, made visible and cumulative.
11. **Continuous Monitoring.** The system keeps watching, and the loop begins again from the next
    signal. Transformation never "finishes"; it compounds.

The value of this journey is that it is **closed** — action connects to measurement connects to
learning connects to the next action. An open loop is where most transformation leaks away; Auxion's
central journey is designed to keep it closed and turning.

---

## Journey 3 — Strategist Collaboration

*Primary persona: Strategist · Supporting: Business Owner, Client, Auxiliary*

How the accountable human partner works *with* a client to shape and steer transformation. This
journey is the human spine that the transformation cycle runs alongside.

1. **Conversation.** The Strategist establishes and maintains the dialogue — the shared, durable record
   of context, questions, and agreement.
2. **Requirements.** They draw out what the business actually needs, turning a client's language into a
   clear understanding of the problem to solve.
3. **Proposal.** They convert diagnosed needs and a configured plan into a concrete offer — building
   quotes and proposals with the pricing authority the role holds — and send it for approval.
4. **Planning.** They sequence the transformation: which moves, in what order, to compound over time.
5. **Recommendations.** They review the Auxiliary's recommendations — weighing evidence and confidence —
   and decide which become moves. They are the human check on the machine.
6. **Reviews.** They review work and results, ensuring quality and honesty before anything reaches the
   client as done.
7. **Meetings.** They meet the client at the moments that warrant synchronous conversation, deepening
   trust and resolving what a thread cannot.
8. **Approvals.** They grant the strategic and commercial authorizations that are theirs alone, and
   they present clients with the approvals that belong to the client.
9. **Deliverables.** They ensure the promised outputs are produced and delivered, connecting execution
   back to what was agreed.
10. **Follow-up.** They close loops and open the next — checking outcomes, sustaining the relationship,
    and keeping the transformation moving between formal cycles.

The measure of this journey is a client who feels **guided by a trusted expert**, not processed by a
system. The Strategist is where Auxion's human accountability becomes tangible.

---

## Journey 4 — Client Progress

*Primary persona: Business Owner / Client · Supporting: Strategist*

How a client *experiences* their transformation — the calm, legible view from the Portal. This journey
is about confidence: the client should always know where their business stands, what needs them, and
how far they have come.

1. **Dashboard.** Their operating picture at a glance — current health, what is underway, and what
   needs their attention today.
2. **Progress.** The Transformation Progress view — the Transformation Index and Stage showing how far
   the business has come and what is next.
3. **Approvals.** The decisions awaiting them, each presented with evidence and reasoning so they can
   decide well and quickly.
4. **Deliverables.** What is being produced for them, with sign-off where their approval is required.
5. **Files.** The shared artifacts relevant to them, scoped to what they should see.
6. **Conversations.** Their direct line to the Auxion team — questions answered, context shared.
7. **Billing.** The commercial relationship presented plainly — proposals, contracts, invoices,
   payment.
8. **Support.** Help when they need it, connected to their real context.
9. **Milestones.** The meaningful markers of progress along the way, so the journey has visible shape.

**Celebrate completed outcomes.** When a move produces a measured result, the client sees it — plainly,
with the evidence, and with credit to the people who decided and did the work. Celebration in Auxion is
dignified and honest (per `04-design-principles.md`): the reward is *seeing the business actually
improve*, not confetti. Marking real outcomes is what turns a sequence of tasks into a felt sense of
transformation, and it is what earns the client's continued conviction.

---

## Journey 5 — Operational Execution

*Primary persona: Operations Manager · Supporting: Strategist, Auxiliary*

How the operational executor turns approved strategy into completed, measured work. This journey sits
inside the transformation cycle, at the execution end.

1. **Review Signals.** Work the inbound signal queue — understanding detected changes and their
   priority.
2. **Prioritize Moves.** Sequence the moves in flight by impact and readiness, so effort goes where it
   matters most.
3. **Assign Work.** Establish clear ownership for each piece of execution — no work without an owner.
4. **Track Execution.** Drive moves through their stages, monitor orchestration health, and intervene
   when work stalls or an automation fails.
5. **Review Evidence.** Confirm that completed work actually did what it should, checking the facts
   before declaring anything done.
6. **Measure Results.** Ensure each move is measured against its promised outcome — the operator's
   commitment to a closed loop, not just finished tasks.
7. **Report Outcomes.** Communicate operational state and results upward and to Strategists, so the
   whole team sees the truth of delivery.

The operator's success is **throughput with integrity**: work completed on time, and completed
honestly — every move driven to a measured outcome rather than merely marked done. Consequential
commercial authorizations remain with the Strategist; the operator runs the machine, they do not own
the commercial decisions.

---

## Journey 6 — AI Assistance

*Primary actor: Auxiliary · Under: every human persona*

How the Auxiliary participates across every journey. This is less a standalone journey than a set of
behaviors woven through all the others, bound by a strict contract.

The Auxiliary can:

- **Observe.** Watch the business continuously for signals a person might miss.
- **Analyze.** Interpret signals and evidence, find patterns, and model trade-offs at machine speed.
- **Recommend.** Propose moves with reasoning, evidence, and stated confidence — a well-formed option,
  never a command.
- **Summarize.** Condense conversations, evidence, and history into clear, faithful summaries.
- **Draft.** Prepare first versions — proposals, messages, plans — for a human to review, edit, and
  own.
- **Predict.** Project likely outcomes and surface risks, always with its confidence and reasoning
  attached.
- **Explain.** Make its own conclusions transparent, so a person can judge them rather than trust them
  blindly.

The Auxiliary must never:

- **Override human approval.** It proposes; humans dispose. It cannot authorize a consequential change,
  and it cannot proceed past an approval gate on its own.
- **Silently execute business-critical actions.** It never takes a consequential action invisibly.
  Anything meaningful it does is surfaced, attributable, and subject to human authorization.

This contract is the immovable boundary of the Human + AI partnership from `02-product-philosophy.md`:
the Auxiliary amplifies people; it never replaces their ownership. Every journey above is designed so
the Auxiliary accelerates the human without ever becoming the decider.

---

## Cross-Journey Principles

These principles hold across every journey. A design that violates one is corrected, or this chapter is
changed deliberately to admit the exception.

1. **Every journey ends in measurable progress.** A journey that produces activity without a measured
   outcome has failed, however well its features worked.
2. **Momentum is a feature.** Journeys are designed to preserve momentum — reaching a clear next step
   quickly — because a stalled journey is an abandoned one.
3. **Understanding precedes action, everywhere.** In every journey the user sees the state and the
   reasoning before they are asked to act. No journey leads with a consequential button.
4. **Every recommendation is explainable.** Anywhere the Auxiliary proposes, its reasoning, evidence,
   and confidence travel with it. A journey never asks a person to act on a conclusion they cannot
   inspect.
5. **Every approval is auditable.** Every consequential authorization across every journey is recorded
   with the person who granted it. Accountability is continuous, not occasional.
6. **Progress is always visible.** At any point in any journey, the user can see where they are, what
   has happened, and what is next. No journey leaves a user in the dark.
7. **The human owns the decision, always.** No journey allows the Auxiliary to cross an approval gate.
   Acceleration never becomes substitution.
8. **Continuity over feature count.** A journey that flows end to end beats a richer set of disconnected
   features. We invest in the seams between steps, not just the steps.
9. **Right altitude for the persona.** Each journey frames the same truth at the altitude its persona
   needs — the client's calm view and the operator's dense view are both correct for their role.
10. **Honest states throughout.** Journeys show real state — including waiting, uncertainty, gaps, and
    failure — plainly. A journey never fakes completeness or hides a bad outcome.
11. **Closed loops, not open ends.** Journeys connect action to measurement to learning. We design the
    return path, not just the outbound one, so value compounds.

---

## Journey Metrics

Journeys are measured by the outcomes they produce, not the clicks they contain (consistent with the
success definition in `01-vision-and-mission.md`). These are the canonical measures and why each
matters.

- **Time to first value.** How quickly a new client reaches their first meaningful outcome (a baseline,
  a first move). *Why it matters:* early value earns trust and momentum; a slow start is where clients
  are lost.
- **Transformation velocity.** The rate at which the business completes moves that produce measured
  improvement. *Why it matters:* velocity is the pulse of the core journey — it shows whether
  transformation is actually compounding.
- **Approval turnaround.** The time from a move being ready to its authorization. *Why it matters:*
  approvals are the gate the whole cycle waits on; slow turnaround stalls everything downstream.
- **Recommendation acceptance rate.** The share of Auxiliary recommendations that Strategists convert
  into moves. *Why it matters:* it measures the quality and trustworthiness of the intelligence — low
  acceptance signals recommendations that are not earning their place.
- **Execution completion.** The share of approved moves driven to a measured outcome. *Why it matters:*
  it is the honesty check on delivery — decided work that never completes is transformation that never
  happened.
- **Client engagement.** Whether clients are present at the decisions that require them — reviewing and
  approving what is theirs. *Why it matters:* engagement here is not vanity usage; it is the client
  fulfilling their accountable role in the loop.
- **Strategist responsiveness.** How promptly Strategists advance conversations, recommendations, and
  approvals. *Why it matters:* the human partner is often the rate-limiter of the journey; their
  responsiveness sets the client's felt pace.
- **Business Health improvement.** The movement in the client's Business Health and Transformation
  Index over time. *Why it matters:* this is the ultimate measure — the whole point of every journey is
  a business that is measurably better.

Note the deliberate absence of engagement-for-its-own-sake metrics — sessions, time in product, feature
adoption. Those are costs, not outcomes (per `01-vision-and-mission.md`). Auxion measures whether the
business improved, and treats the journeys as successful only when they moved that needle.
