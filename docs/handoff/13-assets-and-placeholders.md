# 13 · Asset Inventory & Content Placeholders

> Covers required topics **26 (asset inventory)** and **27 (content placeholders requiring real data)**.

---

## 1. Asset inventory (present)

| Asset | Path (project) | Status | Notes |
|---|---|---|---|
| Brand logo (full lockup, on navy) | `assets/brightloop-logo-navy.png` (1254×1254) | **Provisional** | Only supplied form; **navy background baked in**. Needs vector + transparent + light-bg variants. |
| Fonts — Space Grotesk (display) | Google Fonts | OK | Self-host for production/perf. |
| Fonts — Inter (body) | Google Fonts | OK | Self-host for production/perf. |
| Fonts — JetBrains Mono (code) | Google Fonts | OK | Used for SEO/JSON/URL display. |
| Icon set — Lucide | CDN in prototypes | OK | Tree-shake per-icon in production. |
| Design tokens (CSS) | `reference/tokens/*.css`, `reference/styles.css` | OK | Ship verbatim or transpile. |
| Data-model / state machines | `reference/schema.js` | OK | Source of truth. |
| Reputation dataset | `reference/reputation-data.js` | Placeholder data / real logic | Filter/search/aggregate/schema logic is production-ready; content is sample. |
| Funnel / dashboard / admin data | `reference/{onboarding,dashboard,admin}-data.js` | Placeholder data | Shapes correct; values demo. |

### Assets NEEDED before launch (request from client)
1. **Logo package** — vector (SVG) mark + wordmark + lockup; transparent PNGs; light- and dark-background
   variants; favicon + app icons; OG default image. (Blocks: crisp logo everywhere, favicons, social share.)
2. **Real photography** — portfolio hero + gallery images, client avatars, team photos. Prototype uses
   drag-and-drop image slots (`heroSlot`, `gallerySlots`, `avatarSlot`) as placeholders.
3. **Brand trust-bar logos** — real client/partner logos (homepage trust bar is placeholder text).
4. **Any product/case-study media** — video/Loom/PDF referenced in case studies.

---

## 2. Content placeholders requiring real, approved data

Everything below is **sample content** in the prototypes and **must be replaced** before public launch.
Per the integrity rules, do not treat any of it as real.

**Reputation (public proof) — highest sensitivity**
- **Portfolio projects** (New Greenhouse, PolishedPro Cleaners, Meridian Studio, Harbor & Co, Verdant
  Wellness, Northwind Supply): names, industries, summaries, challenge/approach copy, timelines,
  deliverable counts, tech, live URLs — all **sample**. Replace with real, client-approved case studies.
- **Result metrics:** intentionally **undisclosed** (`metrics.disclosed=false`). Supply only real,
  client-approved numbers and set `disclosed=true`. Never fabricate.
- **Testimonials:** author names, companies, quotes, star + category ratings — **sample**. Must be real,
  attributed, and consented before publishing (and only `public`/`featured` appear).
- **Homepage trust-bar** company names — placeholder.

**Marketing copy**
- Homepage hero/framework/services copy; Services & Industries descriptions; Packages **names + prices**;
  FAQ content — all placeholder-grade. Confirm real messaging + pricing.

**Funnel**
- Assessment questions + scoring weights; configurator module catalog + **prices** + estimate ranges;
  recommendation rationale text — placeholder. Supply real questions, catalog, and pricing.

**Legal**
- Privacy Policy, Terms of Service, Cookie Policy — **placeholder; must be provided by legal counsel.**

**Operational demo data**
- Admin/portal figures (MRR, health scores, pipeline values, project names, invoices, messages) in
  `*-data.js` are demo. Do not ship as if real; wire to live data.

**Company facts**
- Contact details, business address, social links, support email, booking calendar — confirm real values.

> Maintain this list as a pre-launch checklist. Nothing in it may go to production unverified.
