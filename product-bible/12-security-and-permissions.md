# 12 · Security & Permissions

Status: Draft
Owner: Auxion Product Team
Last updated: 2026-07-17

Purpose:
Establishes the authorization model, roles, and security boundaries that protect the product and its data.

---

> This chapter is the **constitutional document governing trust, security, permissions, and
> accountability** in Auxion. It is implementation-independent: it does not describe row-level security,
> tokens, OAuth, auth providers, or database policies, and it must remain valid whatever technology
> enforces it. It defines the permanent *security philosophy and governance model*. Roles are the
> canonical families from `06-user-personas.md`; entities from `09-data-architecture.md`. When the
> security model changes, this chapter changes first (see the prime rule in `README.md`).

---

## Introduction

Security is fundamental to **operational trust**. Auxion holds a business's most sensitive information —
its diagnosis, its strategy, its finances, its decisions, its relationships. A client hands over that
information only because they trust Auxion to protect it, and every part of the product depends on that
trust remaining intact.

Trust of this kind is not asserted; it is **earned through governance, transparency, accountability, and
controlled access.** Governance means clear rules for who can do what. Transparency means those rules and
their enforcement are visible, not hidden. Accountability means every consequential action traces to a
responsible person. Controlled access means information reaches exactly the people entitled to it and no
one else. Together these are what make a business willing to run its transformation through Auxion.

At the same time, **security must protect collaboration without slowing down transformation.** Security
that obstructs legitimate work is a failure of design, not a mark of rigor — it teaches people to work
around the controls, which is worse than having none. Auxion's security is built to be strong *and*
frictionless for authorized work: the right people move quickly, the wrong access never happens, and the
record shows both. The chapters that follow define how that balance is held permanently.

---

## Security Philosophy

Auxion's security is guided by a fixed set of qualities. It should be:

- **Transparent.** How access works is visible and understandable. Security is not a hidden mechanism;
  users and administrators can see what is protected and why.
- **Least privilege.** Everyone holds exactly the access their responsibility requires, and no more.
  Unused authority is a liability to be removed, not a convenience to be kept.
- **Context-aware.** Access depends on context — which organization, which client, which state — not on a
  fixed rank. The same capability applies in one context and not another.
- **Auditable.** Every consequential action leaves an immutable trace. Nothing meaningful happens off the
  record.
- **Scalable.** The model works from one workspace to an enterprise without redesign. Security grows by
  configuration, not by rewriting its foundations.
- **Predictable.** Access behaves consistently. The same role in the same context always has the same
  authority, so no one is surprised by what they can or cannot do.
- **Human-centered.** Security exists to protect people and their work, and it is designed around how
  people actually work — not as a wall they must fight.

**Security must never become an obstacle to legitimate work.** The measure of Auxion's security is not
how much it forbids but how precisely it permits: authorized work flows freely, unauthorized access is
impossible, and both are provable. When security and legitimate work seem to conflict, the design is
wrong and is corrected — not by weakening protection, but by making it more precise.

---

## Identity Model

Identity is the foundation of every access decision. Auxion recognizes a layered identity model:

- **Organization.** The top-level tenant boundary. Every identity belongs to an Organization, and the
  Organization is the outermost wall of isolation.
- **Workspace.** An operating environment within an Organization. Identities act within a workspace, which
  inherits the Organization's boundary.
- **User.** An authenticated person — the actor behind most consequential actions. A User always carries a
  Role and belongs to an Organization.
- **Role.** A named bundle of authority matched to responsibility (`owner`, `admin`, `team_member`,
  `client_admin`, `client_member`, and future roles). A User's Role determines what they may do.
- **Permission.** A single grantable capability. Roles are composed of permissions; permissions are the
  atomic unit of access.
- **Session.** An authenticated period of activity for a User. A session carries the User's verified
  identity and role through their work and is bounded in time.
- **Device.** The endpoint from which a session originates. Device context can inform risk and access
  decisions.
- **External Identity.** An identity federated from outside Auxion (a future enterprise SSO or identity
  provider). External identities map into the model as Users with Roles — they do not bypass it.
- **Service Identity.** A non-human identity for automations, integrations, and the AI Auxiliary. Service
  identities carry scoped, permission-aware authority and are as accountable as human ones — every action
  they take is attributable and audited.

**How identity flows through the platform:** a User authenticates and establishes a Session that carries
their **verified identity and role**. Every subsequent action is evaluated against that identity, its
role, and the context of the request — the Organization, the Workspace, the specific entity. Access is
decided at the point of action, from the identity itself, not from what an interface happens to show.
This means access is enforced consistently no matter how a request arrives, and it means the same
identity carries the same authority everywhere. Service and external identities flow through the same
model, so automation and federated users are governed by exactly the same rules as people.

---

## Permission Philosophy

Permissions in Auxion are based on **responsibilities, not hierarchy.** A permission is the pairing of an
ability with accountability for its use — someone can do a thing because they are responsible for it being
done, not because they sit high on an org chart. Seniority is not a skeleton key. The model expresses this
through several concepts:

- **Role-based permissions.** Baseline authority comes from a User's Role — a bundle of permissions
  matched to a responsibility. Most access is decided this way.
- **Context-aware permissions.** Role authority is scoped by context — which client, which workspace,
  which state. The same role does not grant the same access everywhere; access is bounded to the context
  a person is responsible for.
- **Ownership.** Some authority derives from owning an entity or relationship (a Strategist owns their
  clients; a client owns their own data). Ownership carries responsibility and the access that comes with
  it.
- **Delegation.** Authority can be explicitly delegated from one responsible party to another, recorded
  and bounded. Delegation is deliberate and traceable, never implicit.
- **Temporary permissions.** Access can be granted for a bounded time and then automatically expires.
  Time-limited access is preferred wherever authority is only needed briefly.
- **Approval-based permissions.** Some actions are gated: the ability to *do* the thing is separate from
  the authorization to *proceed*, which comes from an explicit approval (see Approval Boundaries).
- **Emergency access.** Where exceptional access is genuinely required, it is granted explicitly,
  narrowly scoped, time-bounded, and heavily audited — a documented exception, never a quiet back door.
- **Revocation.** Any granted authority can be revoked promptly and completely. Access is not permanent by
  default; it lasts only as long as the responsibility that justifies it.

Together these make access **intentional**: every grant exists for a reason, is scoped to a
responsibility, and can be removed when the responsibility ends.

---

## Core Roles

Each role is defined by its **Purpose**, **Responsibilities**, **Default permissions**, **Restricted
actions**, **Approval authority**, and **Visibility**. Roles map to the personas in
`06-user-personas.md`.

### Business Owner (`client_admin`)
- **Purpose:** The client's principal — the accountable decision-maker for their business.
- **Responsibilities:** Direct their business's transformation; authorize what is theirs.
- **Default permissions:** Full view and participation within their own organization; grant the approvals
  that require the client's authorization.
- **Restricted actions:** No access to other clients, internal operations, or internal-only data
  (strategist notes, internal pricing).
- **Approval authority:** Authorizes their own proposals, contracts, and key deliverables.
- **Visibility:** Their own organization only.

### Operations Manager (`team_member`)
- **Purpose:** The Auxion operational executor who drives approved work to completion.
- **Responsibilities:** Triage signals, drive moves, run orchestrations, keep delivery on track.
- **Default permissions:** Broad operational capability within delivery across assigned clients.
- **Restricted actions:** **No** sales or finance authority — cannot send proposals, countersign
  contracts, or issue invoices.
- **Approval authority:** None for commercial/strategic decisions; prepares and routes work for approval.
- **Visibility:** Internal operational scope across assigned clients.

### Strategist (`owner` / `admin`)
- **Purpose:** The accountable human partner for a client's transformation.
- **Responsibilities:** Own strategy and the relationship; decide and approve consequential moves; own
  the commercial relationship.
- **Default permissions:** Full internal authority including sales and finance capabilities.
- **Restricted actions:** Bounded by governance and audit; cannot act outside recorded accountability.
- **Approval authority:** Authorizes strategic and commercial moves (proposals, contracts, pricing).
- **Visibility:** Their assigned clients and the internal surface.

### Client (`client_member`)
- **Purpose:** A member of the customer's organization other than the principal.
- **Responsibilities:** Participate in the transformation; act on assigned approvals.
- **Default permissions:** View and participate within their own organization's scope; act on approvals
  assigned to them.
- **Restricted actions:** No access to other clients or internal data; less authority than the Business
  Owner.
- **Approval authority:** Only the approvals explicitly assigned to them within their organization.
- **Visibility:** Their own organization only.

### Platform Administrator (`owner` / `admin`)
- **Purpose:** Keeper of the platform's health, security, and configuration.
- **Responsibilities:** Manage users, roles, integrations, security posture, and monitoring.
- **Default permissions:** The broadest platform authority — scoped to *governance*, not client decisions.
- **Restricted actions:** Does not substitute their judgment for a Strategist's on client transformation;
  every administrative action is itself audited.
- **Approval authority:** Governance and configuration changes; not client commercial decisions.
- **Visibility:** Platform-wide governance visibility.

### AI Auxiliary (service identity)
- **Purpose:** The operational intelligence layer that observes, analyzes, and recommends.
- **Responsibilities:** Produce insights, recommendations, summaries, and predictions.
- **Default permissions:** Read access strictly within the requesting context's authorization; no
  consequential write authority.
- **Restricted actions:** **Never** approves, decides, or executes a consequential action; never crosses a
  scope boundary.
- **Approval authority:** None. It proposes; humans dispose.
- **Visibility:** Only what the requesting authorized context may see (`10-ai-architecture.md`).

### Integration Service (service identity)
- **Purpose:** A non-human identity connecting an external system.
- **Responsibilities:** Exchange data and actions with an authorized external system behind a contract.
- **Default permissions:** Narrowly scoped to the specific integration's function.
- **Restricted actions:** Cannot act beyond its scope; cannot cross organizational boundaries; consequential
  inbound actions are signature-verified and gated.
- **Approval authority:** None; it executes within its scope and escalates the rest.
- **Visibility:** Only the data its function requires.

---

## Approval Boundaries

Certain actions require **explicit approval** — the authority to *proceed* is separate from the ability to
*prepare*. Approval is required for, among others:

- **Proposal approval** — sending or accepting a commercial offer.
- **Contract approval** — authorizing a binding agreement (client signature and countersignature).
- **Move approval** — authorizing a consequential change to the business.
- **Financial commitment** — invoicing, spending, or committing money.
- **Workflow publication** — putting a new or changed automation into effect.
- **Permission changes** — granting, elevating, or revoking access.
- **Integration authorization** — connecting or empowering an external system.
- **AI recommendations that trigger business actions** — any recommendation whose execution would be
  consequential.

**Why approval boundaries exist:** they are where accountability is made explicit. An approval boundary
takes a consequential action and requires a named, responsible person to authorize it — turning a thing
that *could* happen into a thing someone *chose* to make happen, on the record. Without these gates,
consequential change could occur with no one answerable for it, which is precisely the accountability gap
Auxion refuses to create. Approval boundaries are the mechanism that guarantees the platform's core rule:
**humans own consequential decisions.** They exist not to slow work but to ensure that when work has
weight, a person stands behind it.

---

## Organization Isolation

Auxion is multi-tenant, and tenant isolation is absolute. **An Organization must never access another
Organization's information** — not through the interface, not through the API, not through automation, and
not through AI. This boundary is the strongest wall in the system.

- **Workspaces inherit organizational boundaries.** A workspace lives inside exactly one Organization and
  can never reach across into another. The Organization boundary contains everything beneath it.
- **Clients only access their own projects.** Within the client experience, a client sees only their own
  business — their projects, conversations, files, deliverables, and billing. One client can never see
  another, even within the same operating workspace.
- **AI must respect organizational context.** The Auxiliary reasons only within the authorized scope of
  the request. It cannot read across an Organization or client boundary, and it can never reveal one
  tenant's information to another. AI is bound by isolation exactly as users are.

Isolation is enforced **structurally**, at the point where data is accessed, not merely in the interface.
The interface may hide what a user should not see, but the guarantee that they *cannot* see it lives
deeper — so that no bug, no crafted request, and no automation can cross the boundary. Isolation is a
property of the system, not a courtesy of the UI.

---

## Audit Philosophy

**Every important action is traceable.** The audit trail is the memory of the system and the substrate of
accountability — it is what lets Auxion prove, after the fact, exactly what happened and who was
responsible. Actions that are recorded include, among others:

- **Login** — who authenticated, when, and from where.
- **Permission changes** — every grant, elevation, delegation, and revocation.
- **Approvals** — every authorization, with the approver and the item.
- **Workflow publication** — every automation put into or removed from effect.
- **AI recommendations** — what was recommended and what a human decided.
- **Conversation actions** — consequential communication and decisions.
- **File access** — access to sensitive artifacts.
- **Configuration changes** — every change to platform and security settings.

**Immutable audit history:** audit records are append-only. They are never edited and never deleted — a
record of what happened cannot be rewritten to say something else. This immutability is what gives the
audit trail its value: a mutable log proves nothing, because anyone who could change it could hide their
tracks. An immutable trail means accountability is permanent. Current state may change; the history of how
it changed is fixed forever. Even administrators, who can configure the platform, cannot alter the record
of what they did — their actions are audited like everyone's.

---

## Data Protection Principles

Auxion protects the information it holds according to established principles:

- **Confidentiality.** Information is disclosed only to those authorized to see it. Access is the exception
  granted by right, not the default.
- **Integrity.** Data is protected from unauthorized or accidental alteration; it stays true to what it is
  meant to represent.
- **Availability.** Authorized users can reach the information they need when they need it; protection
  never means legitimate work is blocked.
- **Encryption.** Sensitive data is protected in transit and at rest by strong, current cryptographic
  protection.
- **Data minimization.** Auxion collects and retains only the data it genuinely needs. Data not held
  cannot be leaked.
- **Retention.** Data is kept only as long as there is a legitimate reason, then handled per defined
  retention policy.
- **Recovery.** Data can be reliably recovered from loss or failure; resilience is designed in.
- **Secure deletion.** When data is to be removed, it is removed securely and verifiably (consistent with
  the soft-delete-of-business-records / permanent-audit distinction in `09-data-architecture.md`).
- **Privacy by design.** Privacy is built into the model from the start — in what is collected, how it is
  scoped, and who can see it — not added as an afterthought.

---

## AI Security

The AI Auxiliary is a powerful actor and is governed accordingly. Its security rules (elaborated in
`10-ai-architecture.md`) are:

- **Permission-aware reasoning.** The Auxiliary reasons only over data the requesting context is
  authorized to see. Its access is bounded exactly as a user's is.
- **Context isolation.** It never mixes or leaks context across organizations or clients. One tenant's
  information can never surface in another tenant's reasoning.
- **No unauthorized knowledge access.** It cannot reach data outside its authorized scope, no matter how a
  request is phrased.
- **Recommendation traceability.** Every AI recommendation is recorded, and the human decision on it is
  recorded, so AI influence on consequential actions is fully auditable.
- **Prompt governance.** The instructions and configuration shaping AI behavior are managed, reviewed, and
  versioned — not edited ad hoc.
- **Model independence.** Security depends on the AI's contract and governance, not on any specific model,
  so the underlying technology can change without weakening protection.
- **Confidence visibility.** The Auxiliary always surfaces its confidence and uncertainty; it never hides
  how sure it is behind an authoritative tone.
- **Human oversight.** Every consequential path the AI touches passes through a human. There is no
  unsupervised AI authority.

AI is held to the *same* isolation, least-privilege, and audit standards as any other identity — with the
additional, absolute constraint that it never crosses an approval gate.

---

## Security Principles

These principles govern all security and access decisions. A design that violates one is corrected, or
this chapter is changed deliberately.

1. **Least privilege by default.** Access starts at the minimum and is granted deliberately. Unused
   authority is a liability, not a perk.
2. **Access is intentional and scoped.** Every grant exists for a reason and is bounded to the
   responsibility that justifies it. Nothing is accessible "just in case."
3. **Every consequential action has a named owner.** No meaningful action happens without a responsible
   identity — human or service — attached to it.
4. **Trust is earned through visibility.** How access works and what happened are transparent. Security is
   provable, not merely asserted.
5. **Isolation is absolute and structural.** Tenant boundaries are enforced where data is accessed, not
   just in the interface, so they cannot be bypassed.
6. **The audit trail is immutable.** History is append-only — never edited, never deleted — so
   accountability is permanent, even for administrators.
7. **Authority follows responsibility, not rank.** Seniority is never a skeleton key; access maps to what
   a person is answerable for.
8. **Permissions expire when appropriate.** Time-bounded and revocable access is preferred over standing
   grants; authority lasts only as long as the responsibility.
9. **Humans own consequential decisions.** Every approval gate is crossed by a person. No automation or AI
   authorizes a consequential action.
10. **AI and services obey the same rules as people.** Non-human identities are least-privilege,
    scope-bounded, and audited exactly as users are — with AI additionally barred from every approval gate.
11. **Security serves legitimate work.** Protection is measured by how precisely it permits, not how much
    it forbids. Friction on authorized work is a defect to fix, not a virtue.
12. **Fail closed.** When authorization is uncertain, access is denied. The safe default is always to
    withhold, never to grant.

---

## Future Evolution

The architecture is built so advanced security and governance capabilities attach to the existing identity
and permission model rather than forcing a redesign, because the model depends on *concepts* — identity,
role, context, scope, approval, audit — not on any specific technology:

- **Enterprise SSO** — an external identity provider federates into the identity model; external identities
  become Users with Roles, governed by the same rules.
- **SCIM** — automated user and group provisioning maps onto Users, Roles, and Organizations without new
  concepts.
- **Advanced RBAC** — richer role hierarchies extend the role model; the permission foundation is unchanged.
- **ABAC** — attribute-based rules extend context-aware permissions, which the model already expresses as
  context and scope.
- **Compliance frameworks** — the immutable audit trail, least privilege, and data-protection principles
  already provide the substrate compliance regimes require; new frameworks are satisfied by policy and
  evidence, not redesign.
- **Regional data residency** — the Organization boundary and tenancy model provide the seam to scope data
  by region.
- **Customer-managed encryption** — the encryption principle accommodates customer-held keys as a
  configuration, not a re-architecture.
- **External identity providers** — additional providers plug into the External Identity concept uniformly.
- **Future governance capabilities** — whatever comes next attaches at the identity, permission, approval,
  or audit seams.

The test for any security advance is constant: **it must be expressible within the identity, permission,
approval, and audit model — attaching at a defined seam — or the model (this chapter) is revised
deliberately, in the open, before it ships.** Because Auxion's security is defined by durable principles
rather than by any technology, the platform can adopt the strongest available protections of any era
without ever weakening the accountability at its core.
