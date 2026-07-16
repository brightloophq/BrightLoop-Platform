/* =============================================================================
 * ██  PLACEHOLDER DATA — NOT REAL PRICING. DO NOT SHIP TO PRODUCTION.  ██
 *
 * Service module catalog, plans and editorial content, ported verbatim from
 * docs/handoff/reference/onboarding-data.js.
 *
 * BLOCKED ON OPEN DECISIONS 1 & 2 (handoff 17-open-decisions.md):
 *   1. Real package names, tiers, prices, and whether pricing is one-time,
 *      retainer or hybrid.
 *   2. Final module list, dependencies, and how the "from" estimate is derived.
 *
 * Every figure below is an indicative "from" ESTIMATE expressed as a RANGE —
 * never a quote. Replacing these values is a DATA change only: no page, no
 * component and no query reads a hardcoded price.
 * ========================================================================== */

import type { Asset, Goal, ModuleContent, Plan, RangeFactor, ServiceModule } from "@brightloop/schema";

export const IS_PLACEHOLDER = true;

/** Service modules. `assets` = capability keys that satisfy/require this module. */
export const PLACEHOLDER_MODULES: readonly ServiceModule[] = [
  // ---- BRAND ----
  {
    id: "brand-identity",
    stage: "Brand",
    name: "Brand Identity",
    from: 1800,
    weeks: [2, 3],
    assets: ["logo", "colors"],
    includes: ["Logo suite", "Color system & typography", "Brand guidelines", "Social profile art"],
    why: "A premium, consistent identity lets you command higher prices and be remembered.",
    deps: [],
    growth: "Brand — perceived value & recall",
  },
  {
    id: "brand-refresh",
    stage: "Brand",
    name: "Brand Polish (upgrade)",
    from: 700,
    weeks: [1, 2],
    upgrade: true,
    assets: ["logo", "colors"],
    includes: ["Logo cleanup & exports", "Color/type tune-up", "Mini guideline"],
    why: "Sharpen an existing brand without a full rebuild.",
    deps: [],
    growth: "Brand — consistency",
  },
  // ---- BUILD ----
  {
    id: "website",
    stage: "Build",
    name: "Website Build",
    from: 3500,
    weeks: [3, 5],
    assets: ["website"],
    includes: ["Conversion-first design", "Up to 6 pages", "CMS & mobile", "Basic SEO & speed"],
    why: "Your website is the engine that turns attention into booked calls.",
    deps: [],
    growth: "Build — conversion",
  },
  {
    id: "landing-page",
    stage: "Build",
    name: "Campaign Landing Page",
    from: 1200,
    weeks: [1, 2],
    assets: ["landing"],
    includes: ["Single high-intent page", "A/B-ready", "Lead capture"],
    why: "A focused page converts paid traffic far better than a homepage.",
    deps: ["website"],
    growth: "Build — campaign conversion",
  },
  // ---- AUTOMATE ----
  {
    id: "crm",
    stage: "Automate",
    name: "CRM & Pipeline Setup",
    from: 1500,
    weeks: [2, 3],
    assets: ["crm"],
    includes: ["Pipeline & stages", "Lead capture wiring", "Dashboards", "Team onboarding"],
    why: "Stop leads slipping through the cracks — see and manage every opportunity.",
    deps: ["website"],
    growth: "Automate — no lost leads",
  },
  {
    id: "automation",
    stage: "Automate",
    name: "Automation & Follow-up",
    from: 1200,
    weeks: [2, 3],
    assets: ["email"],
    includes: ["Auto follow-up sequences", "Booking & reminders", "Tool integrations"],
    why: "Respond in minutes not days and remove hours of manual admin.",
    deps: ["crm"],
    growth: "Automate — response time",
  },
  {
    id: "gbp",
    stage: "Automate",
    name: "Google Business Profile",
    from: 400,
    weeks: [1, 1],
    assets: ["gbp"],
    includes: ["Profile setup/optimize", "Categories & posts", "Review flow"],
    why: "The front door for local discovery and trust.",
    deps: [],
    growth: "Grow — local visibility",
  },
  // ---- GROW ----
  {
    id: "social",
    stage: "Grow",
    name: "Social Presence Setup",
    from: 600,
    weeks: [1, 2],
    assets: ["social"],
    includes: ["Profile setup on key channels", "Templates", "30-day starter plan"],
    why: "Consistent channels build credibility and a discovery surface.",
    deps: ["brand-identity"],
    growth: "Grow — audience",
  },
  {
    id: "analytics",
    stage: "Grow",
    name: "Analytics & Tracking",
    from: 500,
    weeks: [1, 1],
    assets: ["analytics"],
    includes: ["GA4 & events", "Conversion tracking", "Simple dashboard"],
    why: "You can't grow what you can't measure.",
    deps: ["website"],
    growth: "Grow — measurement",
  },
  {
    id: "marketing",
    stage: "Grow",
    name: "Marketing Campaign",
    from: 1800,
    weeks: [3, 4],
    assets: ["campaign"],
    includes: ["Channel strategy", "Creative & copy", "Launch & first optimisation"],
    why: "A predictable engine for qualified, ready-to-buy conversations.",
    deps: ["website", "analytics"],
    growth: "Grow — pipeline",
  },
];

/** Capabilities the client may already own (configurator inventory step). */
export const PLACEHOLDER_ASSETS: readonly Asset[] = [
  { key: "logo", label: "Logo", icon: "pen-tool" },
  { key: "colors", label: "Brand colors", icon: "palette" },
  { key: "website", label: "Website", icon: "layout-grid" },
  { key: "social", label: "Social media pages", icon: "share-2" },
  { key: "gbp", label: "Google Business Profile", icon: "map-pin" },
  { key: "crm", label: "CRM", icon: "route" },
  { key: "email", label: "Email marketing", icon: "mail" },
  { key: "analytics", label: "Analytics", icon: "line-chart" },
];

export const PLACEHOLDER_PLANS: readonly Plan[] = [
  {
    id: "foundation",
    name: "Foundation",
    tag: "Starter",
    blurb: "The essentials — configured to skip what you already have.",
    modules: ["brand-identity", "website", "gbp", "analytics", "social"],
  },
  {
    id: "launch",
    name: "Launch",
    tag: "Popular",
    blurb: "Go to market with brand, site and core automation.",
    modules: ["brand-identity", "website", "crm", "automation", "analytics", "social", "gbp"],
  },
  {
    id: "transform",
    name: "Transform",
    tag: "",
    blurb: "Rebrand, rebuild and overhaul operations.",
    modules: [
      "brand-identity",
      "website",
      "landing-page",
      "crm",
      "automation",
      "analytics",
      "marketing",
      "gbp",
      "social",
    ],
  },
  {
    id: "partner",
    name: "Growth Partner",
    tag: "Retainer",
    blurb: "Ongoing brand, build, automate & grow.",
    modules: [
      "brand-identity",
      "website",
      "crm",
      "automation",
      "analytics",
      "marketing",
      "landing-page",
      "social",
      "gbp",
    ],
  },
];

export const PLACEHOLDER_GOALS: readonly Goal[] = [
  { id: "launch", label: "Launch a new business", icon: "rocket" },
  { id: "leads", label: "Get more qualified leads", icon: "trending-up" },
  { id: "automate", label: "Automate my operations", icon: "workflow" },
  { id: "rebrand", label: "Modernize my brand", icon: "sparkles" },
  { id: "scale", label: "Scale what's working", icon: "line-chart" },
];

/** Why an estimate is a range, not a fixed price. Rendered beside every range. */
export const PLACEHOLDER_RANGE_FACTORS: readonly RangeFactor[] = [
  ["Business size", "More locations, products or team members mean more to set up."],
  ["Existing assets", "What you already have in good shape reduces the build — and the cost."],
  ["Integrations", "Connecting more tools and systems adds setup work."],
  ["Project complexity", "Custom features and deeper requirements shift the estimate up."],
];

/** Rich editorial content per module, keyed by module id. */
export const PLACEHOLDER_CONTENT: Readonly<Record<string, ModuleContent>> = {
  "brand-identity": {
    outcome: "A Brand That Earns Instant Trust",
    promise:
      "Look established and premium so customers choose you before they even pick up the phone.",
    range: [1800, 3600],
    deliverables: [
      ["Discovery Workshop", "We learn your business, customers and goals so the brand is built on strategy, not guesswork."],
      ["Logo Suite", "A primary logo plus variations for every place your brand appears — signage, social, favicon."],
      ["Colour System", "A defined palette that looks intentional and consistent everywhere, from your site to your invoices."],
      ["Typography System", "Fonts chosen for personality and readability, so your communications feel considered."],
      ["Brand Guidelines", "A simple rulebook so your team — and anyone you hire — keeps everything on-brand."],
      ["Social Profile Art", "Ready-to-use profile and cover images so every channel looks polished from day one."],
      ["Brand Voice Starter", "How your business should sound in writing — confident, clear and unmistakably you."],
    ],
    impact: {
      value: "A premium identity lets you charge more and be remembered.",
      results: "Higher perceived value, stronger recall, easier referrals.",
      complexity: "Low — mostly your time in the workshop.",
      future: "Becomes the foundation every website, campaign and deck is built on.",
      next: "Professional Business Website",
    },
    resp: {
      bl: ["Facilitate discovery", "Design all brand assets", "Deliver source files & guidelines"],
      you: ["Share business goals & examples you like", "Give timely feedback", "Approve final direction"],
    },
    upgrades: ["Full brand messaging & positioning", "Pitch deck & sales collateral", "Brand photography direction"],
  },
  "brand-refresh": {
    outcome: "A Sharper Version of Your Brand",
    promise: "Modernise what you already have without the cost of a full rebrand.",
    range: [700, 1500],
    deliverables: [
      ["Logo Cleanup & Exports", "We tidy and re-export your logo in every format you actually need."],
      ["Colour & Type Tune-up", "Refine your palette and fonts so everything feels current and consistent."],
      ["Mini Guideline", "A one-pager so your refreshed look stays consistent going forward."],
    ],
    impact: {
      value: "Keeps hard-won recognition while looking current.",
      results: "A cleaner, more credible look for less.",
      complexity: "Low.",
      future: "A stepping stone to a full identity when you're ready.",
      next: "Professional Business Website",
    },
    resp: {
      bl: ["Audit current assets", "Refine and re-export", "Deliver mini guideline"],
      you: ["Send existing files", "Approve refinements"],
    },
    upgrades: ["Full Brand Identity", "Brand guidelines expansion"],
  },
  website: {
    outcome: "Professional Business Website",
    promise: "Build a website that attracts, convinces and converts visitors into customers.",
    range: [3500, 7500],
    deliverables: [
      ["Discovery Workshop", "We align on your customers, goals and what a 'win' looks like before designing."],
      ["Website Strategy", "We plan the pages and messaging that move a visitor from curious to convinced."],
      ["UX Planning", "We map out the ideal customer journey to increase enquiries and conversions."],
      ["UI Design", "A polished, on-brand design that builds instant credibility."],
      ["Responsive Development", "Built to look and work perfectly on phones, tablets and desktops."],
      ["Contact Forms", "Capture enquiries reliably and route them straight to you or your CRM."],
      ["Basic SEO Foundation", "Set up so Google can find, understand and rank your pages."],
      ["Speed Optimisation", "Fast load times so visitors don't leave before the page appears."],
      ["Analytics Setup", "See where visitors come from and what they do, so you can improve."],
      ["Security Hardening", "SSL, backups and protection so your site stays safe and online."],
      ["CMS Training", "A short session so you can update content yourself with confidence."],
    ],
    impact: {
      value: "Your website is the engine that turns attention into booked calls.",
      results: "More enquiries from the same traffic; a credible first impression.",
      complexity: "Medium — needs your content & feedback.",
      future: "The hub every campaign, automation and landing page plugs into.",
      next: "CRM & Pipeline Setup",
    },
    resp: {
      bl: ["Strategy, design & build", "SEO, speed & security setup", "Train your team"],
      you: ["Provide copy & imagery (or brief us)", "Review at each milestone", "Approve go-live"],
    },
    upgrades: ["E-commerce / booking", "Advanced SEO programme", "Additional landing pages"],
  },
  "landing-page": {
    outcome: "A Page Built to Convert Campaigns",
    promise: "Turn paid clicks into leads with a single, focused, high-intent page.",
    range: [1200, 2600],
    deliverables: [
      ["Conversion Strategy", "We define the one action the page must drive and design everything around it."],
      ["High-Intent Design", "A distraction-free layout proven to convert ad traffic."],
      ["Lead Capture", "Forms wired to your CRM so no lead is lost."],
      ["A/B-Ready Setup", "Structured so we can test and improve conversion over time."],
    ],
    impact: {
      value: "A focused page converts paid traffic far better than a homepage.",
      results: "Lower cost per lead; higher campaign ROI.",
      complexity: "Low.",
      future: "A repeatable template for every future campaign.",
      next: "Marketing Campaign",
    },
    resp: {
      bl: ["Strategy, design & build", "CRM wiring"],
      you: ["Share the offer & audience", "Approve the page"],
    },
    upgrades: ["Multi-variant testing", "Campaign landing-page library"],
  },
  crm: {
    outcome: "Never Lose Another Lead",
    promise: "See and manage every opportunity in one place so nothing slips through the cracks.",
    range: [1500, 3200],
    deliverables: [
      ["Pipeline & Stages", "A clear deal flow so you always know where every opportunity stands."],
      ["Lead Capture Wiring", "Every form, call and message lands in your CRM automatically."],
      ["Dashboards", "See pipeline value, conversion and what needs attention at a glance."],
      ["Team Onboarding", "We train your team so the CRM actually gets used."],
    ],
    impact: {
      value: "Stop leads slipping through the cracks — manage every opportunity.",
      results: "Faster follow-up, higher close rate, clear pipeline visibility.",
      complexity: "Medium.",
      future: "The backbone that automation and reporting build on.",
      next: "Automation & Follow-up",
    },
    resp: {
      bl: ["Configure CRM & pipeline", "Wire lead sources", "Train the team"],
      you: ["Share your sales process", "Attend onboarding", "Adopt the workflow"],
    },
    upgrades: ["Advanced automation", "Sales reporting suite", "Quoting & proposals"],
  },
  automation: {
    outcome: "Your Operations, Running Themselves",
    promise: "Respond in minutes not days and remove hours of manual admin every week.",
    range: [1200, 2800],
    deliverables: [
      ["Follow-up Sequences", "Automatic, timely follow-up so leads never go cold."],
      ["Booking & Reminders", "Self-service scheduling with reminders that cut no-shows."],
      ["Tool Integrations", "Your apps talk to each other so data flows without copy-paste."],
      ["Workflow Automations", "The repetitive tasks eating your week, handled automatically."],
    ],
    impact: {
      value: "Respond faster and reclaim hours of manual work.",
      results: "Minutes-not-days response, fewer no-shows, less admin.",
      complexity: "Medium.",
      future: "Compounds as you add more of your operations.",
      next: "Analytics & Tracking",
    },
    resp: {
      bl: ["Design & build automations", "Integrate your tools", "Document the flows"],
      you: ["Map current processes", "Provide tool access", "Test with us"],
    },
    upgrades: ["AI assistants", "Advanced ops automation", "Custom integrations"],
  },
  gbp: {
    outcome: "Own Your Local Search",
    promise: "Become the obvious local choice when customers search near you.",
    range: [400, 900],
    deliverables: [
      ["Profile Setup / Optimise", "A complete, accurate profile that ranks and builds trust."],
      ["Categories & Posts", "Set up to appear for the searches that matter, with fresh posts."],
      ["Review Flow", "A simple system to earn more 5-star reviews on autopilot."],
    ],
    impact: {
      value: "The front door for local discovery and trust.",
      results: "More calls, directions and clicks from local search.",
      complexity: "Low.",
      future: "Feeds your broader local SEO and reputation.",
      next: "Social Presence Setup",
    },
    resp: {
      bl: ["Set up & optimise profile", "Build review flow"],
      you: ["Verify the listing", "Provide business details"],
    },
    upgrades: ["Local SEO programme", "Reputation management"],
  },
  social: {
    outcome: "Channels That Build Credibility",
    promise: "Show up consistently so prospects trust you before the first conversation.",
    range: [600, 1400],
    deliverables: [
      ["Profile Setup", "Professional, on-brand profiles on the channels your customers use."],
      ["Content Templates", "Reusable templates so posting stays easy and consistent."],
      ["30-Day Starter Plan", "A ready-to-post plan so you launch with momentum."],
    ],
    impact: {
      value: "Consistent channels build credibility and a discovery surface.",
      results: "A trustworthy presence prospects can check.",
      complexity: "Low.",
      future: "The base for ongoing content and campaigns.",
      next: "Marketing Campaign",
    },
    resp: {
      bl: ["Set up & brand profiles", "Build templates & plan"],
      you: ["Provide brand assets", "Post the starter plan"],
    },
    upgrades: ["Managed content", "Paid social campaigns"],
  },
  analytics: {
    outcome: "Know Exactly What Drives Growth",
    promise: "Measure what matters so every decision is backed by data, not guesses.",
    range: [500, 1100],
    deliverables: [
      ["GA4 & Events", "Track the actions that matter — enquiries, calls, bookings."],
      ["Conversion Tracking", "Know which channels and pages actually produce customers."],
      ["Simple Dashboard", "One clear view of performance, no spreadsheet gymnastics."],
    ],
    impact: {
      value: "You can't grow what you can't measure.",
      results: "Clear visibility into what's working and what to fix.",
      complexity: "Low.",
      future: "Powers smarter marketing and reporting.",
      next: "Marketing Campaign",
    },
    resp: {
      bl: ["Install & configure tracking", "Build dashboard"],
      you: ["Provide site access", "Tell us your key actions"],
    },
    upgrades: ["Advanced attribution", "Automated reporting"],
  },
  marketing: {
    outcome: "A Predictable Pipeline of Customers",
    promise: "Turn strangers into qualified, ready-to-buy conversations — on repeat.",
    range: [1800, 4500],
    deliverables: [
      ["Channel Strategy", "We pick the channels most likely to reach your best customers."],
      ["Creative & Copy", "Ads and messages designed to stop the scroll and drive action."],
      ["Campaign Launch", "We launch, monitor and hand you a working engine."],
      ["First Optimisation", "We tune based on real results to improve cost per lead."],
    ],
    impact: {
      value: "A predictable engine for qualified, ready-to-buy conversations.",
      results: "A repeatable source of qualified pipeline.",
      complexity: "Medium.",
      future: "Scales as you invest more into what works.",
      next: "Growth Partner retainer",
    },
    resp: {
      bl: ["Strategy, creative & launch", "Monitor & optimise"],
      you: ["Set budget & goals", "Provide offer details", "Review results with us"],
    },
    upgrades: ["Ongoing growth retainer", "Multi-channel scaling"],
  },
};

/**
 * PLACEHOLDER — discipline-level marketing copy for /services.
 * Handoff §13 lists Services descriptions as placeholder-grade pending real
 * messaging from the product owner.
 */
export const PLACEHOLDER_DISCIPLINE_COPY: Readonly<
  Record<string, { eyebrow: string; outcome: string; blurb: string; icon: string }>
> = {
  Brand: {
    eyebrow: "Discipline 01",
    outcome: "Be chosen before you're contacted",
    blurb: "Identity, voice and guidelines that make a small business look established and trusted.",
    icon: "pen-tool",
  },
  Build: {
    eyebrow: "Discipline 02",
    outcome: "Turn attention into booked calls",
    blurb: "Conversion-first websites and landing pages built to be found, understood and acted on.",
    icon: "layout-grid",
  },
  Automate: {
    eyebrow: "Discipline 03",
    outcome: "Stop losing leads to admin",
    blurb: "CRM, follow-up and workflow automation so nothing slips and response takes minutes.",
    icon: "workflow",
  },
  Grow: {
    eyebrow: "Discipline 04",
    outcome: "Make the pipeline predictable",
    blurb: "Measurement, presence and campaigns that compound into repeatable demand.",
    icon: "trending-up",
  },
};
