# PX.1g — Visual Evidence Index

**Honesty statement.** This environment could start the dev server and drive the page via
text/DOM/JS tools, but the **Browser pane is not displayable**, so the compositor cannot
render frames and **screenshots could not be captured**. No screenshot or visual
before/after is claimed. The evidence below is what was genuinely observed
(text/DOM/computed-CSS/logs/build), plus the theme-token computed values that directly
prove the one visual fix. Vercel preview visual QA was not performed under an
authenticated SSO session.

## What was genuinely validated

| # | Surface / concern | Method | Result |
|---|---|---|---|
| 1 | Public home renders | `navigate /`, title | "Auxion — Brands. Systems. Growth." · OK |
| 2 | Console (public home) | `read_console_messages(onlyErrors)` | No errors |
| 3 | Navbar glass token — Light | `javascript_tool` computed bg of glass expression | `srgb(0.984 0.980 0.973 / 0.82)` — matches old near-white |
| 4 | Navbar glass token — Dark | same, `data-theme="dark"` | `srgb(0.078 0.086 0.106 / 0.82)` — now dark; defect gone |
| 5 | Login surface renders | `navigate /login`, title | "Sign in · Auxion" · OK |
| 6 | Portal route compiles + auth-gates | `navigate /portal` | Redirects to Sign in, no 500 |
| 7 | Workspace route compiles + auth-gates | `navigate /workspace` | Redirects to Sign in, no 500 |
| 8 | Server errors during the above | `preview_logs(level=error)` | "No server errors found" |
| 9 | Production build (all routes) | `pnpm turbo run build` | Success, 9/9 tasks |

## What was NOT captured (and is not claimed)
- Rendered screenshots of any surface (Light / Dark / System · desktop / mobile ·
  reduced-motion) — Browser pane not displayable.
- Authenticated interactive QA of Console, Signals, Analytics, System Map, AI actions,
  Integrations, Billing, Workspace, Portal (no authenticated headless session).
- Rendered PDF-vs-UI design diff (no PDF rasterizer — see Design Parity).

## Recommended pre-sign-off pass (environment permitting)
Authenticated Vercel preview walk of the priority surfaces (Console · Signals · Analytics
· System Map · AI actions · Integrations · Billing · Workspace · Portal · Login) across
Light / Dark / System and desktop / mobile / reduced-motion, capturing screenshots. The
code changes are token-level and structural and are verified by the gate + the checks
above, but a human/rendered visual pass is the appropriate final confirmation.
