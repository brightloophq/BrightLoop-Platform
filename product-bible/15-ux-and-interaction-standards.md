# 15 · UX & Interaction Standards

Status: Draft
Owner: Auxion Product Team
Last updated: 2026-07-17

Purpose:
Codifies the interaction and behavioral standards that ensure a consistent, trustworthy user experience.

---

> This chapter is Auxion's **UX constitution**. It governs *behavior* — usability, interaction, feedback,
> and accessibility: how Auxion feels and responds. It is implementation-independent (no components,
> frameworks, or transports). It complements, and is distinct from, the **visual Design System**, which
> governs visual tokens, typography, colors, spacing, and component presentation. The authoritative Design
> System is the code package `@brightloop/ui` at `application/packages/ui/` (tokens in
> `application/packages/ui/src/tokens/`, components in `application/packages/ui/src/components/`) — this
> chapter defines behavioral consistency, that package defines visual consistency. It builds on the design
> philosophy in `04-design-principles.md` and the AI/collaboration contracts in `10` and `13`. When the
> interaction model changes, this chapter changes first (see the prime rule in `README.md`).

---

## Introduction

The best UX is **invisible.** When an interface works, the user does not notice it — they notice that they
got their work done, understood their situation, and moved forward with confidence. When an interface is
bad, the user notices the software: they wrestle with it, wonder what happened, and lose the thread of what
they were actually trying to do. Auxion's aim is the first kind: an experience so clear it disappears,
leaving the user's attention on their business rather than on the tool.

This is the point. Users do not come to Auxion to learn software; they come to **transform their business**
(`07-user-journeys.md`). Every moment spent deciphering the interface is a moment stolen from that purpose.
An operating system for business transformation earns its keep by getting out of the way — by making the
right thing obvious and the mechanics effortless.

So the standard for every interaction in Auxion is concrete: **it should reduce uncertainty, increase
confidence, and guide meaningful progress.** An interaction that leaves a user unsure of what happened,
hesitant about what to do, or no closer to an outcome has failed, however polished it looks. The sections
below define how Auxion behaves so that its interface consistently does those three things.

---

## UX Philosophy

Auxion's interfaces are built to feel:

- **Calm.** Composed and unhurried, never anxious or loud. A calm surface is what lets people think and
  decide well.
- **Confident.** Clear and self-assured, so the user feels the ground is solid beneath them.
- **Predictable.** The same thing behaves the same way every time, so users build a reliable mental model
  and stop having to think about the interface.
- **Helpful.** Actively easing the user's path — anticipating needs, surfacing the next step, preventing
  errors.
- **Professional.** Serious and credible, matching the weight of the decisions it supports. This is an
  operator's instrument, not a toy.
- **Context-aware.** Responsive to who the user is, where they are, and what they are doing — showing the
  right thing at the right moment.
- **Respectful.** Of the user's time, attention, intelligence, and choices. It never wastes, patronizes, or
  manipulates.
- **Efficient.** Letting users accomplish what they came for with the least friction — fast paths for the
  work they do often.

**Operational software should reduce cognitive effort, not impress users.** The people who rely on Auxion
are spending scarce attention on real decisions; every ounce the interface consumes with novelty,
decoration, or complexity is an ounce taken from the decision. Impressiveness is a cost the user pays;
clarity is a gift the interface gives. Auxion chooses clarity, always — the measure of its UX is how little
the user has to think about it.

---

## Interaction Principles

These principles govern every interaction. A design that violates one is corrected, or this chapter is
changed deliberately.

1. **Every action has a clear purpose.** Nothing on screen exists to be clicked for its own sake. If an
   action's purpose is not obvious, it is redesigned or removed.
2. **Every interaction gives feedback.** The system always acknowledges what the user did — nothing happens
   in silence. An unacknowledged action is a broken one.
3. **The user never wonders what happened.** After any action, the result and the new state are clear.
   Ambiguity about "did that work?" is a defect.
4. **Understanding precedes action.** The user sees the state and the reasoning before they are asked to
   commit (`04-design-principles.md`). No consequential action leads before its context.
5. **Actions are reversible where practical.** Users can undo, correct, or back out safely. Where an action
   cannot be reversed, the interface makes its finality clear and confirms before proceeding.
6. **Progress is always visible.** The user can always see where they are, what has happened, and what is
   next. No one is left in the dark mid-task.
7. **Consistency creates confidence.** The same pattern means the same thing everywhere. Predictability is
   what lets users act quickly without re-checking.
8. **The system prevents errors before correcting them.** Good design makes mistakes hard to make in the
   first place, and easy to recover from when they happen.
9. **Destructive actions are guarded.** Anything hard to undo requires deliberate confirmation and is never
   the accidental result of a stray click.
10. **The fast path exists for frequent work.** Common, repeated tasks are made efficient; the interface
    does not force experienced users to crawl through beginner steps.
11. **Defaults are sensible and safe.** The default choice is the one most users should make, and it is
    never the risky one. Good defaults reduce decisions.
12. **The interface respects the user's context.** It remembers where they were, preserves their work, and
    does not make them re-establish context the system could hold.
13. **Confirmation matches consequence.** Trivial actions proceed freely; consequential ones ask for
    deliberate confirmation. Friction is proportional to stakes.
14. **Honesty in every state.** The interface shows real state — loading, empty, partial, failed,
    uncertain — plainly, never faking completeness or success (`04-design-principles.md`).
15. **Guide, don't trap.** The interface leads users toward good outcomes without cornering them. There is
    always a clear way forward and a clear way back.

---

## Navigation Experience

Navigation moves users through operational context (`05-information-architecture.md`) without ever leaving
them lost:

- **Orientation.** At every point, the user knows where they are, what surface they are on, and what this
  screen is for. Orientation is never something they have to reconstruct.
- **Hierarchy.** The structure is legible — what contains what, and how to move up a level. The path is
  always clear.
- **Context preservation.** Moving between places preserves the user's context and work. They do not lose
  their place or their progress by navigating.
- **Breadcrumbs.** Where the user is within the structure is shown, and the path back is one deliberate step
  away.
- **Workspace transitions.** Entering and leaving a workspace is a coherent movement through a connected
  space, not a jarring jump between unrelated screens (motion reinforces the relationship — see Motion).
- **Progressive disclosure.** Depth is available on demand; the surface leads with the essential and reveals
  detail as the user goes deeper, so navigation stays calm.

**Avoid disorientation.** The cardinal navigation failure is a user who does not know where they are, how
they got there, or how to get back. Auxion designs against it: every transition keeps the user oriented,
every place tells them what it is, and there is always an obvious path forward and back.

---

## Feedback & System Status

Auxion communicates its state honestly and appropriately for every situation. The user is never left
guessing what the system is doing.

- **Loading.** Communicate that work is underway. Where progress is knowable, show it; where it is not,
  indicate activity without implying false precision. Never let a delay look like a freeze.
- **Saving.** Make it clear when work is being saved and when it is safely stored. The user should never
  wonder whether their work is preserved.
- **Success.** Confirm that an action succeeded, clearly and proportionately — enough to reassure, not so
  much as to interrupt.
- **Warnings.** Surface conditions that need attention before they become problems, calmly and with the path
  to address them.
- **Errors.** State plainly what went wrong, in the user's language, with what they can do about it. Errors
  are honest and actionable, never opaque or alarming for its own sake.
- **Pending approvals.** Make clear when something waits on an authorization — whose, and what is blocked —
  so nothing stalls invisibly.
- **Workflow progress.** Show the state of running work (`11-automation-architecture.md`) so the user can
  see execution advancing and know when it completes or needs them.
- **Synchronization.** Communicate when data is syncing or reconciling, so the user trusts what they see is
  current.
- **AI processing.** Indicate when the Auxiliary is working, and present its output as a reviewable proposal
  when ready — never a silent change (see AI Interaction Standards).

The governing rule: **every state has a defined, honest expression.** The user should always be able to
answer "what is the system doing, and is my work safe?" from the interface alone.

---

## Empty States

An empty state is an opportunity, not a gap. Every empty state in Auxion should:

- **Educate.** Explain what belongs here and why this area matters, so an empty screen teaches rather than
  puzzles.
- **Guide the next step.** Offer a clear, encouraging path to the first meaningful action.
- **Explain why it is empty.** Tell the user whether it is empty because they are new, because nothing has
  happened yet, or because a filter is hiding content — so emptiness is understood, not alarming.
- **Never feel unfinished.** An empty state is a designed state, as considered as a full one. It should feel
  intentional and complete, never like a bug or a missing screen.
- **Encourage meaningful action.** Point the user toward doing the thing that will fill this space with
  value — the first move, the first conversation, the first scan.

A well-designed empty state turns a moment of "there's nothing here" into a moment of "here's how to
begin" — which is especially important during onboarding, where empty states are the user's first real
impression of the product.

---

## Forms & Data Entry

Forms are where users hand the system their intent, and they are a common place for frustration. Auxion's
forms are respectful and forgiving:

- **Validation.** Inputs are validated clearly and helpfully, guiding the user to correct data rather than
  punishing mistakes. Validation explains, it does not scold.
- **Inline feedback.** Feedback appears in context, at the field, as the user works — not only after a
  failed submission. Problems are surfaced where and when they occur.
- **Autosave philosophy.** Where work is substantial, it is preserved as the user goes, so a mistake, a
  timeout, or a navigation never costs them their effort. The user should rarely fear losing work.
- **Draft handling.** Incomplete work can be saved and resumed. Users are not forced to finish in one
  sitting, and returning to a draft restores their context.
- **Error recovery.** When something goes wrong, the user's input is preserved and the path to fix it is
  clear. They never have to re-enter everything because of one error.
- **Confirmation.** Consequential submissions are confirmed proportionate to their stakes, so the user
  commits deliberately without being nagged on the trivial.
- **Progress indicators.** In multi-step entry, the user always knows how far along they are and what
  remains.
- **Accessibility.** Every field is properly labeled, keyboard-operable, and legible to assistive technology
  (see Accessibility in Practice). Forms are usable by everyone.

The standard: **a form should feel like the system helping the user express their intent, not the user
serving the system's need for data.**

---

## AI Interaction Standards

Users interact with the Auxiliary as they would with a capable, honest colleague — never with a magic box.
The interaction is bound by the AI contract (`10-ai-architecture.md`):

- **Recommendations** are presented as clear proposals with an expected outcome — options to consider, never
  commands or faits accomplis.
- **Confidence indicators** accompany every recommendation and prediction, so the user knows how much weight
  it can bear.
- **Explanations** are always available — the reasoning behind any conclusion can be seen, so the user can
  judge it rather than trust it blindly.
- **Evidence** is shown or reachable, so the user can verify the basis of a recommendation.
- **Uncertainty** is expressed plainly. The Auxiliary says what it does not know; it never projects false
  certainty.
- **Review** is built into the flow. AI output arrives as something to examine and adjust, with the human
  clearly in the reviewing seat.
- **Approval** gates every consequential AI-suggested action. Nothing the Auxiliary proposes takes effect
  without a human authorizing it.
- **Conversation** with the Auxiliary is natural and in-context, and its contributions are always clearly
  attributable to the Auxiliary, never disguised as a human (`13-conversation-and-collaboration.md`).
- **Transparency** is total: what the AI did, recommended, and reasoned is visible and recorded.

**AI should feel like an expert colleague, not magic.** A magic box asks for blind trust and hides its
workings; a good colleague shows their reasoning, states their confidence, admits what they are unsure of,
and leaves the decision to you. Auxion's AI is designed to feel like the latter — impressive because it is
*useful and honest*, not because it is mysterious. The moment AI feels like magic is the moment it stops
being trustworthy.

---

## Notification Philosophy

Notifications are a promise about the user's attention, and Auxion keeps that promise carefully:

- **Priority.** Notifications are ranked by genuine importance, so what matters reaches the user and what
  does not stays quiet.
- **Timing.** They arrive when they are useful and actionable, not the instant they are technically
  possible.
- **Grouping.** Related notifications are grouped rather than fired one by one, so the user sees a coherent
  summary, not a stream.
- **Escalation.** Truly important items that go unaddressed escalate appropriately, while routine ones do
  not clamor.
- **Persistence.** Notifications that require action persist until handled; transient confirmations do not
  linger.
- **Dismissal.** Users can dismiss and control notifications easily. Their attention is theirs to manage.
- **Actionability.** A notification connects to the thing it concerns, so the user can act directly rather
  than hunt for context.

**Avoid notification fatigue.** A system that notifies too much trains users to ignore it, which means the
one notification that mattered is missed — the failure mode is worse than under-notifying. Auxion treats
each notification as a withdrawal from a limited account of trust and attention, and spends it only when the
value to the user clearly justifies the interruption. Fewer, better, well-timed notifications beat many.

---

## Motion & Micro-Interactions

Motion in Auxion communicates; it never decorates (`04-design-principles.md`). Its behavioral roles:

- **State transitions.** Motion shows a change of state — an item moving from one status to another — so the
  change is legible and feels intentional.
- **Hover states.** Subtle response on hover signals what is interactive, aiding discovery without noise.
- **Focus.** Focus is always clearly and immediately indicated, so keyboard and assistive-tech users know
  where they are (see Accessibility).
- **Selection.** Selecting something responds clearly, confirming the user's choice registered.
- **Expansion.** Revealing or collapsing detail animates the relationship, so the user understands where the
  new content came from.
- **Workflow completion.** The completion of running work is marked clearly, so the user knows it finished.
- **Loading.** Motion communicates activity during waits, honestly reflecting that work is underway.
- **Approval celebrations.** Meaningful moments — an approval granted, an outcome achieved — are marked with
  restraint and dignity: clear, affirming, settled. Never confetti, never a game reward (`07-user-
  journeys.md`).

**Motion communicates, it does not decorate.** Every animation answers a question the user would otherwise
have to reconstruct — what changed, where it came from, what happened. Motion that does not do this is
removed, and all motion honors reduced-motion preferences.

---

## Accessibility in Practice

Accessibility is a definition-of-done requirement (`04-design-principles.md`), expressed here as concrete
interaction behavior:

- **Keyboard flow.** Every task is fully operable by keyboard, in a logical order, with nothing reachable
  only by pointer. Keyboard users are first-class.
- **Focus order.** Focus moves in a sensible, predictable sequence, and focus is always visibly indicated.
- **Reduced motion.** When a user requests reduced motion, animation is minimized while meaning is preserved
  through non-motion cues. Motion is never required to understand the interface.
- **Readable language.** Text is plain, clear, and legible — Auxion asks people to read reasoning and
  evidence, so readability is fundamental.
- **Touch targets.** Interactive elements are large enough to hit reliably, with adequate spacing, so touch
  use is error-free.
- **Contrast.** Text and meaningful elements meet or exceed recognized contrast standards, and color is
  never the sole carrier of meaning.
- **Assistive technology.** Structure is semantic and meaningful to assistive tools — proper labels, roles,
  and reading order — so the experience conveys the same understanding aurally as visually.

**Inclusive interaction design** is not a mode or an accommodation bolted on; it is how every interaction is
built. An interaction that excludes any user is not "mostly done" — it is broken for that user, and Auxion
treats it as a defect like any other.

---

## UX Quality Checklist

Every new feature is reviewed against these questions before it ships. A "no" is a defect to resolve, not a
detail to defer.

1. Can a first-time user understand what this is and what it's for?
2. Is the next action obvious?
3. Is the primary objective of the screen clear at a glance?
4. Does every action give clear feedback?
5. After each action, does the user know what happened and what the new state is?
6. Is progress through any multi-step flow always visible?
7. Can the user recover from errors without losing their work?
8. Are destructive or irreversible actions clearly guarded and confirmed?
9. Are consequential actions preceded by the context and evidence that justify them?
10. Does every state — loading, empty, partial, error, success — have an honest, designed expression?
11. Does the empty state educate and guide toward a first meaningful action?
12. Does the AI explain its reasoning, show its confidence, and admit uncertainty?
13. Does every consequential AI suggestion pass through explicit human approval?
14. Is the user always oriented — do they know where they are and how to get back?
15. Is the fast path available for work the user does frequently?
16. Are defaults sensible and safe?
17. Is the whole feature operable by keyboard, with visible focus and logical order?
18. Does it meet contrast, readable-language, and touch-target standards, and respect reduced motion?
19. Are notifications from this feature prioritized, grouped, timely, and actionable?
20. Does motion here communicate a real change, or is it decoration to remove?
21. Does the interaction reduce uncertainty and increase the user's confidence?
22. Does the experience, on balance, reinforce trust in Auxion?

---

## UX Principles

These timeless principles govern all UX judgment. A decision that violates one is corrected, or this chapter
is changed deliberately.

1. **Reduce thinking.** The interface does the work of sorting, remembering, and structuring so the user can
   spend their thought on the decision, not the tool.
2. **Make the next step obvious.** At every point there is a clear, encouraging path forward. The user is
   never stranded wondering what to do.
3. **Reveal context, not just controls.** Show the user why they are being asked to act before showing the
   action. Understanding precedes interaction.
4. **Feedback is not optional.** Every action is acknowledged. Silence is a bug.
5. **Guide without controlling.** Lead users toward good outcomes while leaving them in charge. There is
   always a way forward and a way back.
6. **Predictability builds trust.** The same thing behaves the same way everywhere. Consistency is a feature
   that compounds into confidence.
7. **Honesty over reassurance.** Show real state, including uncertainty and failure, rather than a
   comforting fiction. Trust is built on truth.
8. **Prevent, then recover.** Design so mistakes are hard to make and easy to fix. Prevention beats
   correction; recovery beats punishment.
9. **Respect attention as a scarce resource.** Interrupt, notify, and animate only when the value to the
   user justifies the cost to their focus.
10. **Teach through interaction.** The product explains itself in context, so users learn by doing rather
    than by studying documentation.
11. **The fast path for the frequent, the guided path for the new.** Serve both the experienced operator and
    the first-timer without forcing either into the other's pace.
12. **Celebrate real progress, quietly.** Mark meaningful outcomes with dignity and evidence — the reward is
    seeing the business improve, not a spectacle.
13. **Every user is a first-class user.** Accessibility and inclusion are how interactions are built, not an
    accommodation added later.
14. **The interface should disappear.** Success is the user focused on their business, not on the software.
    Great UX is invisible.
15. **Every interaction should earn trust.** The ultimate test of any interaction is whether it leaves the
    user more confident in Auxion. Trust is the product; the interface is how it is felt.
