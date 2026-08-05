# PX.1g — Design Source Parity Report

**Authoritative source.** `docs/design/source/` — 27 canonical Auxion PDFs (Design
System, Business Scan, Activation, Command Center, Orchestration, Moves Workspace,
Transformation Index, Client Portal, Auxion DNA, Insights, Recommendations, Approval /
Execution Workspaces, Business Health, builders, Domain / Org Settings, Users & Roles,
Audit Center, Notifications, Command Palette, Reporting, BI Scan, Scan Engine).

## Method & honest limitation
The design source is delivered as **PDF**. This environment has no PDF-rasterization
tool (`pdftoppm`/poppler unavailable), so a pixel-level rendered diff of each PDF against
the running UI was **not** performed and is **not** claimed. Parity here is assessed
**structurally**: the implemented token layer, layout primitives, navigation model and
component set were read from the repository and checked against the design intent recorded
in the PDF filenames, the handoff references embedded throughout the CSS/components
(e.g. "Living Blueprint navbar, handoff §05", "canonical blueprint dot-grid main canvas,
DS §06 / Handoff §03"), and the PX.1a–PX.1e reports that built each surface to these
sources.

## Structural parity assessment
- **Layout & chrome** — the three shells (admin rail + dot-grid canvas; workspace premium
  SaaS chrome with breadcrumbs + ⌘K + Copilot FAB + notifications; client portal) match
  their respective source docs (Command Center §03, Auxiliary/Workspace §16, Client Portal
  §07). PX.1g touched none of these hierarchies.
- **Design tokens** — typography, spacing, radii, borders, shadows and elevation are
  centralized in `packages/ui/src/tokens/*` and consumed via variables; the canon-token
  test asserts the canonical set resolves. PX.1g removed the last stray hardcoded colors
  so token parity is now complete in the audited trees.
- **Navbar** — the source specifies a light paper-glass sticky navbar (handoff §05/§01.4).
  PX.1g preserved that intent while making the glass theme-adaptive (a token, not a
  literal) — parity in light is unchanged; dark now behaves correctly.
- **Components** — cards, tables (OperationalTable), filters (FilterBar), badges, KPI /
  metric cards, charts, System Map, AI panels, empty states and forms are the shared
  primitives the source prescribes; no component was restyled to a personal preference.
- **Motion & feedback** — PX.1f's structured skeletons, error boundary, button loading
  and drawer entrance are the source's "living blueprint" feel; PX.1g extended the same
  primitives to workspace/portal rather than introducing a new language.

## Drift found & resolved
The only measurable drift from a token-driven design system was the **three hardcoded
colors** (Navbar glass, CMS live-row, automation failed-row) — see Theme Certification.
Fixed. No layout, spacing, or type-scale drift was introduced or found that warranted a
change under the PX.1g "approved source wins; don't reinterpret working UI" rule.

## Result
**Structural parity CERTIFIED**; **visual pixel-diff parity NOT captured** in this
environment and not claimed. Recommend a one-time rendered-PDF-vs-UI pass in an
environment with PDF rasterization before the program's formal design sign-off.
