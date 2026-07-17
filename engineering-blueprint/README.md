# Auxion Engineering Blueprint

## Purpose

The Engineering Blueprint defines **how the existing BrightLoop platform evolves into the Auxion Business
Transformation Operating System** — the technical construction plan that turns the approved Product Bible
and the Engineering Discovery Report into an implementable foundation.

It sits alongside two other authorities and does not duplicate them:

- **The Product Bible** defines *what Auxion is* — its philosophy, canonical vocabulary, architecture of
  concepts, governance, and long-term direction.
- **The Design System** (`application/packages/ui/`) defines *how Auxion looks and behaves visually* —
  tokens, typography, colors, spacing, and component presentation.
- **The Engineering Blueprint** (this document set) defines *how Auxion is technically constructed* — the
  domain, AI, automation, observability, and verification foundations, and the sequence in which they are
  built.

Two framing commitments govern everything here:

- **The existing frozen baseline (`brightloop-frozen-v1`) remains the implementation substrate.** Auxion is
  an *evolution* of a working, secure, production-grade platform — not a greenfield rewrite.
- **The blueprint focuses primarily on the missing foundations**, not on redesigning systems that already
  work. Proven capabilities are preserved; the blueprint's energy goes where the Discovery Report found
  genuine gaps.

## Architectural Context

Summary of the current engineering position (per the Engineering Discovery Report).

**Existing strengths — reusable substrate:**

- Next.js 15 App Router **modular monolith** (Server Components + Server Actions).
- **pnpm + Turborepo** monorepo (`apps/web` + `@brightloop/{schema, domain, data, db, ui}`).
- **Supabase authentication and database** (PKCE, SSR sessions, JWT role claims via a DB access-token hook).
- **Strong Row Level Security** — 34 tables with RLS enabled, 89 policies, verified by an audit function.
- **Capability-based authorization** — a role/permission matrix enforced in the service layer *and* RLS.
- **Domain and data package boundaries** — a framework-agnostic domain layer with repository ports.
- **Guarded state transitions** — every material lifecycle change flows through one audited seam
  (`performTransition`) backed by DB triggers.
- **Reusable UI system** — the `@brightloop/ui` design system (tokens + ~40 components).
- **CI and Vercel deployment** — GitHub Actions quality gate (typecheck · lint · test · build + secret
  scan) and a working production deployment.

**Missing foundations — the blueprint's focus:**

- **Transformation-cycle domain** — Signal, Insight, Recommendation, Move, Measurement, Learning, Business
  Health, Transformation Index, Operational Risk, Knowledge Asset are not yet modeled.
- **AI Auxiliary architecture** — no AI layer exists (no provider abstraction, prompt/context management,
  memory, or retrieval); today's intelligence is deliberately rule-based.
- **Durable automation runtime** — only an inbound webhook + mock adapters; no queue, workers, scheduler,
  or outbound orchestration.
- **Observability** — no tracing, metrics, health checks, structured logging, or AI/automation monitoring
  beyond analytics events and platform defaults.
- **Live database and end-to-end testing** — 226 unit/integration tests exist, but CI runs in placeholder
  mode (no DB), and there are no live-RLS or E2E tests.

## Blueprint Chapters

| Chapter | Title | Status |
|---|---|---|
| 00 | Engineering Principles | ✅ **Complete** |
| 01 | Foundation Gap Analysis | 🔲 Planned |
| 02 | Transformation Domain | 🔲 Planned |
| 03 | AI Foundation | 🔲 Planned |
| 04 | Automation Runtime | 🔲 Planned |
| 05 | Observability and Verification | 🔲 Planned |
| 06 | Build Sequence | 🔲 Planned |

Only Chapter 00 exists at this time. Chapters 01–06 are planned and will be authored in later phases.

## Authority

- **The Product Bible has authority over product behavior and philosophy.** What Auxion *is* and *should
  do* is settled there.
- **The Engineering Blueprint has authority over technical implementation.** How Auxion is *built* — its
  boundaries, contracts, invariants, and sequence — is settled here.
- **The existing codebase is evidence of the current implementation, not automatic authority over future
  architecture.** That a thing is done a certain way today is a fact to account for, not a decision that
  binds the future. Working systems are preserved by *deliberate choice* (see the doctrine of preserving
  proven foundations), not by default.
- **When the code, the blueprint, and the Product Bible disagree, the disagreement must be resolved
  explicitly.** One of them is updated on purpose — the code is corrected, the blueprint is revised, or the
  Product Bible is amended — and the resolution is recorded.
- **No architectural deviation is introduced silently.** A change to a boundary, contract, or invariant is
  a documented decision, never an emergent side effect of a feature.

## Change Policy

The Engineering Blueprint is **versioned alongside the repository** and lives in the same source control as
the code it governs. It is updated whenever a **material engineering decision changes** — a new foundation,
an altered boundary or contract, a revised invariant, or a superseded approach. Blueprint changes are made
deliberately and reviewed like architecture, so the document and the system it describes never drift apart.
When an implementation must diverge from the blueprint, the blueprint is updated first (or in the same
change), so it remains a truthful account of how Auxion is constructed.

---

Status: Draft · Owner: Auxion Engineering · Last updated: 2026-07-17
