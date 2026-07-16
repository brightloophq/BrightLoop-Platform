# 04 · Design System — Tokens, Components, Responsive

> Covers required topics **10 (design tokens)**, **11 (type/spacing/color/border/shadow/motion)**,
> **9 (component inventory)**, **12 (desktop/tablet/mobile behavior)**.
> **Canonical source:** `reference/tokens/*.css` + `reference/styles.css`. Ship these CSS custom
> properties verbatim (or transpile to your styling system). Namespace `window.BrightLoopDesignSystem_5ea80f`
> in the prototypes → in production just expose components under your own module.

The system is **dark-first**: Midnight Navy is the primary canvas. A light theme exists
(`[data-theme="light"]` / `.bl-theme-light`) and swaps semantic aliases + softer shadows.

---

## 1. Color tokens (`tokens/colors.css`)

**Brand core**
| Token | Hex | Use |
|---|---|---|
| `--bl-navy` | `#0B1220` | Midnight Navy — primary canvas |
| `--bl-blue` | `#2563EB` | Bright Blue — primary action |
| `--bl-cyan` | `#22D3EE` | Electric Cyan — accent / highlight |
| `--bl-white` | `#FFFFFF` | — |
| `--bl-slate` | `#64748B` | Slate Gray — secondary text |
| `--bl-soft` | `#F8FAFC` | Soft White — light surface |

**Scales** — Navy `950 #060A13 · 900 #0B1220 · 850 #0E1729 · 800 #111C33 · 700 #16233F · 600 #1E2E4F · 500 #263A63`;
Blue `50 #EFF5FF → 500 #2563EB → 800 #1B3985`; Cyan `50 #ECFDFF → 400 #22D3EE → 600 #0A8FAE`;
Slate `50 #F8FAFC → 500 #64748B → 900 #0F172A`.

**Semantic status** — `--success #16B364 · --warning #F5A524 · --danger #EF4444 · --info var(--bl-cyan)`.
(Note: the reputation star-rating uses `#F5B301` gold; keep it for stars specifically.)

**Brand gradient (logo loop, used sparingly)** — `--grad-loop: linear-gradient(135deg,#2563EB,#22D3EE)`.
Do **not** use gradients as generic decoration — loop mark / rare CTA emphasis only.

**Semantic aliases (dark, default)** — `--bg-base:navy-900 · --bg-raised:navy-850 · --surface-card:navy-800 ·
--surface-inset:navy-950 · --border-subtle:rgba(255,255,255,.08) · --border-strong:rgba(255,255,255,.16) ·
--text-primary:#fff · --text-secondary:slate-300 · --text-muted:slate-500 · --text-accent:cyan ·
--text-link:blue-400 · --action-primary:blue · --action-primary-hover:blue-600 · --action-primary-press:blue-700 ·
--focus-ring:cyan`. Light theme overrides these (see colors.css).

---

## 2. Typography (`tokens/typography.css`)
- **Display/headings:** `--font-display: "Space Grotesk"`. **Body/UI:** `--font-body: "Inter"`.
  **Mono:** `--font-mono: "JetBrains Mono"` (code/SEO JSON, canonical URLs).
- **Scale:** display 72 / h1 52 / h2 40 / h3 30 / h4 22 / lg 18 / body 16 / sm 14 / xs 12 (rem-based).
- **Weights:** 400/500/600/700. **Line-heights:** tight 1.05, heading 1.15, snug 1.35, body 1.6.
- **Letter-spacing:** tight −0.02em (headings), normal 0, wide 0.04em, **eyebrow 0.18em** (uppercase labels).
- **Minimum sizes:** body text never below 14px; slide/hero display large. Eyebrows are 12px uppercase
  cyan with 0.18em tracking.

---

## 3. Spacing, radius, shadow, motion, layout (`tokens/layout.css`)
- **Spacing (4px base):** 0,4,8,12,16,24,32,48,64,96,128 → `--space-0…10`. Use `gap` on flex/grid.
- **Radius:** sm 6 · md 10 · lg 16 · xl 24 · 2xl 32 · pill 999.
- **Shadows (dark-tuned):** sm `0 1px 2px rgba(2,6,18,.4)` · md `0 6px 20px …45` · lg `0 18px 48px …55` ·
  xl `0 32px 80px …6`. **Glows** `--glow-blue`, `--glow-cyan` for rare CTA emphasis. Light-theme shadow set included.
- **Motion:** `--ease-out cubic-bezier(.16,1,.3,1)` (default), `--ease-inout cubic-bezier(.65,0,.35,1)`;
  durations fast 140ms · base 240ms · slow 420ms. Respect `prefers-reduced-motion` — entrance reveals
  become instant. Avoid infinite decorative loops.
- **Layout:** `--container 1200 · --container-wide 1360 · --gutter clamp(1.25rem,4vw,4rem) · --header-h 72`.

## 4. Effects (`tokens/effects.css`)
- **Elevation map:** 0 none · 1 sm (chip/input) · 2 md (card rest) · 3 lg (card hover/popover) · 4 xl (modal/drawer).
- **Blur:** xs 4 · sm 8 · md 14 (sticky-header glass) · lg 24 (modal scrim) · xl 40 (hero glow).
- **Opacity:** disabled 0.5 · muted 0.7 · hint 0.4 · scrim 0.72.
- **Z-index scale:** base 0 · raised 10 · sticky 40 (header) · dropdown 45 (mega-menu/select) ·
  overlay 50 (drawer) · modal 60 · toast 70 · tooltip 80. **Use these — never ad-hoc z-index.**
- **Borders:** width 1/2px; hairline = 1px `--border-subtle`; default = 1px `--border-strong`;
  accent = 1px cyan; focus = 2px `--focus-ring`. **Focus ring:** `--ring-focus 0 0 0 3px rgba(34,211,238,.35)`.

## 5. Responsive framework (`tokens/responsive.css`)
- **Breakpoints (min-width, mobile-first):** sm 480 · md 768 · lg 1024 · xl 1280 · 2xl 1536.
- **Grid:** 12 cols desktop (gutter 24) → 12 (gutter 20) at <1024 → **6 cols (gutter 16) at <768**.
  Helpers `.bl-grid`, `.bl-container`, `.bl-container--wide`.
- **Containers:** sm 640 (forms/prose) · md 768 · lg 1024 · prose 68ch.
- **Section rhythm:** `--section-y clamp(64,8vw,128) · -tight clamp(40,5vw,72) · -hero clamp(80,10vw,160)`.

### Device behavior (applies across all surfaces)
- **Desktop ≥1024:** full multi-column layouts; sidebars expanded; portfolio filter rail visible;
  detail pages use content + sticky sidebar (`grid-template-columns: 1fr 300px`).
- **Tablet 768–1023:** 2-col grids collapse toward single; portal/admin sidebar → icon rail;
  detail sidebars drop below content; portfolio filter rail hidden behind a "Filters" button.
- **Mobile <768:** single column; hamburger → drawer nav; filters/aggregate panels stack; tables
  become stacked cards or horizontally scroll with a pinned first column; **min hit target 44px**.
- The reputation prototype's media query (in `website/Reputation.html`) is the canonical example of
  these collapses (`.rep-portfolio-grid`, `.rep-detail-grid`, `.rep-agg`).

---

## 6. Component inventory (43 components)

All live under the design-system namespace; the prototypes read them from
`window.BrightLoopDesignSystem_5ea80f`. Source: `components/*` with `.jsx` + `.d.ts` + `.prompt.md`
per component, and specimen cards in `guidelines/*` and `components/*/*.card.html`.

**Brand** — `Logo` (variants: mark, wordmark, lockup; height prop), `Icon` (Lucide wrapper; `name`,
`size`), `Eyebrow` (uppercase tracked label).

**Forms** — `Button` (variants primary/secondary/ghost/gradient; sizes sm/md/lg; `leftIcon`/`rightIcon`/
`block`/`disabled`/`loading`), `IconButton`, `Input`, `Select`, `Checkbox`, `Switch`, `RadioGroup`,
`SearchInput`, `FilterBar`, `Booking` (scheduler).

**Content** — `Card`, `Badge` (tones: neutral/cyan/success/warning/danger; `dot`), `Stat`, `StatCard`,
`FeatureCard`, `ServiceCard`, `CaseStudyCard`, `Testimonial`, `Tag`, `Tabs`, `Accordion`, `Timeline`,
`PricingCard`, `ComparisonTable`.

**Feedback** — `Alert`, `Tooltip`, `Progress`, `Spinner`, `Skeleton`, `EmptyState`, `Toast`.

**Overlay** — `Modal`, `Drawer`.

**Navigation** — `Navbar`, `MegaMenu`, `Footer`, `DropdownMenu`, `Breadcrumb`, `Pagination`.

**Marketing** — `CTASection`.

> Each component's `.d.ts` is the prop contract; the `.prompt.md` documents intent and usage.
> Reproduce the same prop surface in your component library. Reputation-specific primitives
> (`Stars`, `RatingBar`, `CategoryRatings`, `MediaTile`, `AwardPill`, `PublishChip`) live in
> `website/rep-shared.jsx` — promote them into the shared library.

Icon set: **Lucide**. Keep icon usage consistent with the prototypes' names.
