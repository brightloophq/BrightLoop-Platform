# PX.1g — Responsive Certification

**Scope.** Certify behavior across large desktop, standard laptop, tablet and mobile
(≈375px), focused on overflow, touch targets, collapsing grids, and navigation reach.

## Certified correct (shared primitives)
- **Tables** — `OperationalTable.module.css:1-4` wraps in `.scroll { overflow-x: auto }`
  **and** reflows to stacked cards under 767px (58-104). No mobile overflow.
- **Drawer** — `width: min(380px, 90vw)` (responsive, not fixed px).
- **Toast** — `max-width: min(92vw, 380px)`; full-width mobile override.
- **FilterBar** — flex-wrap; stacks to full-width column under 640px.
- **FormSection** — two-column grid on `minmax(0,1fr)` (no blowout); single column at
  640px.
- **Pagination** — `flex-wrap: wrap`; 44px touch targets on coarse pointers.
- Sweep for fixed px `width`/`min-width` in the primitives found only intentional touch
  targets (44/48px) — none wide enough to cause horizontal scroll at 375px. Grids use
  `minmax(0,1fr)` and collapse at breakpoints.

## Fixed in PX.1g
- **Portal mobile navigation (P1-1)** — the single real responsive defect. Below 1024px
  the portal sidebar was slid off-canvas (`admin.module.css:294-302`) with **no opener**,
  making navigation unreachable, and `.main` reserved `padding-top:56px` for a bar that
  was never rendered. Fixed by `PortalShell` (mobile top bar + opener + scrim + off-canvas
  drawer), reusing the admin mobile mechanism and CSS. Portal now matches admin/workspace:
  every destination is reachable on a phone, and the reserved bar space is now occupied.

## Shell responsive behavior (verified in code)
- **Admin** — `AppSidebar` mobile bar + GSAP drawer + scrim + Escape + close-on-nav; same
  `groups` feed desktop rail and mobile drawer (identical destinations).
- **Workspace** — `WorkspaceShell` topbar menu button toggles the same `<aside
  data-open>`; same `WORKSPACE_NAV` in both modes; ⌘K palette + Copilot FAB.
- **Portal** — now equivalent via `PortalShell`.
- Route-loading skeletons added at the workspace/portal roots reserve the real layout's
  dimensions (built on `SkeletonBlock`/`PageSkeleton`), so a slow navigation doesn't
  collapse the content column.

## Documented, not changed
- **SystemMap** fixed inline `height={size}` can distort the square only if a caller
  passes a `size` larger than the viewport; the default (280) is safe on 375px
  (`SystemMap.module.css` caps `max-width:100%` + `aspect-ratio:1/1`). P3.

## Result
**CERTIFIED.** No horizontal-overflow, clipped-content, or unreachable-control defect
remains in the audited primitives and shells; the one P1 (portal mobile nav) is fixed.
A device-matrix screenshot pass was not captured (Browser pane not displayable — see
Visual Evidence Index); certification is code-level plus the primitives' existing
responsive rules.
