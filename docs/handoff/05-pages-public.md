# 05 · Page Specs — Public Experience

> Covers required topic **8 (page-by-page)** for the public site. Prototypes: `website/Homepage.html`,
> `website/Reputation.html`, `platform/Onboarding.html`, `platform/Auth.html`. Each page below lists
> **purpose · layout · key components · content source · states**. Per-field validation is in
> `09-forms-and-states.md`; SEO requirements in `10-behaviors.md`.

All public pages share: sticky glass **Navbar** + Services **MegaMenu**, **Footer**, dark canvas
(`--bg-base`), max width `--container-wide` with `--gutter`. Entrance reveals via IntersectionObserver
(disabled under `prefers-reduced-motion`).

---

## Homepage `/`
- **Purpose:** communicate the integrated Brand·Build·Automate·Grow loop; drive to assessment/booking.
- **Layout (top→bottom):** split hero (headline + subcopy + dual CTA left, animated loop visual right) →
  trust bar (industry logos) → framework section (the four disciplines) → services overview →
  proof/marquee case study (`Results`) → testimonials (pulled from reputation data) → assessment CTA.
- **Components:** Navbar, MegaMenu, Button, Eyebrow, Stat, Badge, Icon, Testimonial figures, StarRow, CTASection, Footer.
- **Content source:** testimonials + featured case study auto-pull from `reputation-data.js`
  (`homeTestimonials()`, featured project). **Trust-bar logos are placeholder** (NORTHWIND, Vertex, …).
- **States:** reveal-on-scroll; testimonials fall back to static copy if reputation data unavailable.

## Services `/services` and `/services/:discipline`
- **Purpose:** explain each discipline and its modules; route into configurator.
- **Layout:** overview = 4 discipline cards (icon, name, outcome, "explore"); detail = hero + module
  list + representative outcomes + "Add to configurator" CTA.
- **Components:** ServiceCard, FeatureCard, Badge, Button, Accordion (FAQ), CTASection.
- **Content source:** service modules in `platform/data.js` (module catalog). **Copy is placeholder-grade** — confirm.

## Industries `/industries` and `/industries/:slug`
- **Purpose:** show relevance per industry; surface matching portfolio work.
- **Layout:** overview grid of industry tiles; detail = intro + challenges + relevant services +
  filtered portfolio strip (industry = slug) + testimonials from that industry.
- **Components:** Card, Tag, ProjectCard (reused from reputation), Testimonial.
- **Content source:** industry list from `FACETS.industry`; portfolio strip = `query({filters:{industry:[slug]}})`.

## Packages & Pricing `/packages`
- **Purpose:** present productized packages + comparison; route to configurator for custom.
- **Layout:** pricing cards (tiers) + ComparisonTable + "build your own" CTA → configurator.
- **Components:** PricingCard, ComparisonTable, Badge, Button.
- **Content source:** plans in `platform/data.js`. **Prices are placeholder** — replace with real pricing.
- **States:** highlight recommended tier; monthly/one-time toggle if applicable (confirm — see open decisions).

## Portfolio / Success Stories `/portfolio`
- **Purpose:** filterable proof gallery. **Prototype: `website/rep-portfolio.jsx`.**
- **Layout:** page header → search + sort bar → active-filter chips → `grid-template-columns: 260px 1fr`
  (filter rail + card grid `repeat(auto-fill,minmax(300px,1fr))`) → pagination.
- **Filters:** Industry, Service, Business Size, Country, Completion Year, Budget Range, Technology
  (collapsible facet groups with counts). **Search:** business/industry/keyword/service.
  **Sort:** Featured first / Most recent / A–Z. See `10-behaviors.md` for exact semantics.
- **Components:** ProjectCard, FilterGroup, Badge, Stars, Pagination, EmptyState, Drawer (mobile filters).
- **Content source:** `publicProjects()` (publish ∈ public|featured only). **All project content is placeholder.**
- **States:** empty (no matches → "Clear filters"), loading (skeleton cards), paginated (9/page).
- **Responsive:** <900px → filter rail hidden behind "Filters" button opening a right Drawer; single-column grid.

## Project Case Study `/portfolio/:slug` (and long-form `/case-studies/:slug`)
- **Purpose:** full case study with honest metrics handling. **Prototype: `website/rep-detail.jsx`.**
- **Layout:** back link → header (industry/service badges, title, summary, awards, live-site CTAs) →
  hero image → **project-facts stat grid** (timeline, services, deliverables, industry, platform,
  completed, status) → content + sticky sidebar (`1fr 300px`): challenge, approach, **Results**, gallery,
  testimonial (with category ratings); sidebar = tech, tags, collapsible **SEO & metadata** panel →
  "You may also like" related grid.
- **Components:** StatChip, Badge, AwardPill, Button, MediaTile, Stars, CategoryRatings, ProjectCard, SeoRow.
- **Content source:** `bySlug(slug)`, `related(project)`, `schemaFor(project)`.
- **Integrity states — critical:**
  - **Results** render **only** if `metrics.disclosed && value exists`; otherwise show the "results kept
    private at the client's request" panel. Never fabricate.
  - **Live preview** ("Visit live website" + "Open in new tab") shows only when
    `permissionLivePreview && liveUrl`; otherwise a "live preview not shared" note.
- **SEO:** canonical `/portfolio/:slug`, meta title/description, Open Graph, JSON-LD (`schemaFor`) — see `10`.

## Testimonials `/testimonials`
- **Purpose:** aggregate reputation + category-rated reviews. **Prototype: `website/rep-testimonials.jsx`.**
- **Layout:** centered header → **aggregate summary** (big average + stars + "based on N verified reviews" +
  per-category rating bars, `260px 1fr`) → star filter (All / 5+ / 4+) → **masonry wall** (`column-width:360px`)
  of testimonial cards (stars, quote, media, avatar, expandable category ratings, "View project").
- **Components:** Stars, RatingBar, CategoryRatings, MediaTile, TestimonialCard, Badge.
- **Content source:** `publicTestimonials()`, `aggregate()`. **Reviews are placeholder & must be real+approved.**
- **States:** pinned reviews first; only publish ∈ public|featured shown.

## Business Health Assessment `/assessment` (funnel 1)
- **Purpose:** capture business profile → Health Score. **Prototype: `platform/steps.jsx` (assessment step).**
- **Layout:** progress rail + single-question-group-per-step; radio/scale inputs; back/continue.
- **Components:** RadioGroup, Progress, Button, Card.
- **Content source:** assessment questions in `platform/data.js`. `onboarding` state machine (resumable).
- **States:** save-and-exit (resumable via magic link), abandoned nudges, completed → recommendation.

## Package Configurator `/configurator` (funnel 2)
- **Purpose:** select modules; de-dup owned assets; live estimate. **Prototype: `platform/configurator.jsx`.**
- **Layout:** module catalog (grouped by discipline) with add/remove; "what you already have" inventory
  that de-duplicates; sticky summary with **live "from" range estimate**; module detail drawer.
- **Components:** Card, Checkbox/Switch, Badge, Drawer, Button, Stat.
- **Content source:** modules + pricing in `platform/data.js`. Persists to `Configuration` entity.
- **States:** empty (nothing selected → prompt), estimate updates live, owned-asset dedupe messaging.
- **Note:** the 13″/split-screen overflow fix (main column `minmax(0,1fr)`, collapse at 1024px) is required.

## AI Recommendation `/recommendation` (funnel 3, derived)
- **Purpose:** synthesize assessment + configuration into a recommended path. **Prototype: `platform/steps.jsx`.**
- **Layout:** recommended package summary + rationale + priority-ordered modules + CTA to roadmap/booking.
- **Content source:** derived from `Assessment.scores` + `Configuration`. **No fabricated ROI numbers** —
  qualitative rationale only unless real benchmarks are supplied.

## Business Roadmap `/roadmap` (funnel 4, derived)
- **Purpose:** phase the recommended work over time; book a strategy call. **Prototype: `platform/roadmap.jsx`.**
- **Layout:** phased timeline (Brand→Build→Automate→Grow ordering) + per-phase deliverables + booking modal.
- **Components:** Timeline, Card, Button, Booking modal.
- **States:** booking modal (scheduler); completing books call / creates account (prospect→member).

## Contact & Booking `/contact`
- **Purpose:** general contact + strategy-call scheduling.
- **Layout:** split — contact form (name/email/company/message) left, scheduler right.
- **Components:** Input, Button, Booking. Validation in `09`.
- **States:** submit success/error; scheduler slot selection + confirmation; calendar integration (see `12`).

## Authentication `/login /signup /reset /verify`
- **Purpose:** account access. **Prototype: `platform/Auth.html` + `auth.jsx` (5 screens: login, signup,
  forgot, reset, verify) in a split brand-panel + form shell.**
- **Components:** Input (email/password with show/hide), Button, Alert, Checkbox (remember/consent).
- **States:** field validation, invalid credentials error, magic-link/verify sent, reset success,
  loading on submit, disabled until valid. See `11-nfr.md` for auth requirements.

## Legal `/legal/privacy /legal/terms /legal/cookies`
- **Purpose:** compliance pages. **Layout:** prose container (`--container-prose 68ch`), last-updated date,
  section nav. **Content source:** **placeholder — must be supplied by legal.** Cookie page ties to Consent entity.
