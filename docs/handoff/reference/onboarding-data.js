/* BrightLoop platform — Phase 1 data catalog.
   Service modules grouped by the loop; plans; assessment; asset→module map.
   Prices are "from" estimates (indicative, refined on the strategy call). */
window.BL_DATA = (function () {
  // Service modules. `assets` = capability keys that satisfy/require this module.
  const MODULES = [
    // BRAND
    { id: "brand-identity", stage: "Brand", name: "Brand Identity", from: 1800, weeks: [2, 3],
      assets: ["logo", "colors"],
      includes: ["Logo suite", "Color system & typography", "Brand guidelines", "Social profile art"],
      why: "A premium, consistent identity lets you command higher prices and be remembered.",
      deps: [], growth: "Brand — perceived value & recall" },
    { id: "brand-refresh", stage: "Brand", name: "Brand Polish (upgrade)", from: 700, weeks: [1, 2], upgrade: true,
      assets: ["logo", "colors"],
      includes: ["Logo cleanup & exports", "Color/type tune-up", "Mini guideline"],
      why: "Sharpen an existing brand without a full rebuild.",
      deps: [], growth: "Brand — consistency" },
    // BUILD
    { id: "website", stage: "Build", name: "Website Build", from: 3500, weeks: [3, 5],
      assets: ["website"],
      includes: ["Conversion-first design", "Up to 6 pages", "CMS & mobile", "Basic SEO & speed"],
      why: "Your website is the engine that turns attention into booked calls.",
      deps: [], growth: "Build — conversion" },
    { id: "landing-page", stage: "Build", name: "Campaign Landing Page", from: 1200, weeks: [1, 2],
      assets: ["landing"],
      includes: ["Single high-intent page", "A/B-ready", "Lead capture"],
      why: "A focused page converts paid traffic far better than a homepage.",
      deps: ["website"], growth: "Build — campaign conversion" },
    // AUTOMATE
    { id: "crm", stage: "Automate", name: "CRM & Pipeline Setup", from: 1500, weeks: [2, 3],
      assets: ["crm"],
      includes: ["Pipeline & stages", "Lead capture wiring", "Dashboards", "Team onboarding"],
      why: "Stop leads slipping through the cracks — see and manage every opportunity.",
      deps: ["website"], growth: "Automate — no lost leads" },
    { id: "automation", stage: "Automate", name: "Automation & Follow-up", from: 1200, weeks: [2, 3],
      assets: ["email"],
      includes: ["Auto follow-up sequences", "Booking & reminders", "Tool integrations"],
      why: "Respond in minutes not days and remove hours of manual admin.",
      deps: ["crm"], growth: "Automate — response time" },
    { id: "gbp", stage: "Automate", name: "Google Business Profile", from: 400, weeks: [1, 1],
      assets: ["gbp"],
      includes: ["Profile setup/optimize", "Categories & posts", "Review flow"],
      why: "The front door for local discovery and trust.",
      deps: [], growth: "Grow — local visibility" },
    // GROW
    { id: "social", stage: "Grow", name: "Social Presence Setup", from: 600, weeks: [1, 2],
      assets: ["social"],
      includes: ["Profile setup on key channels", "Templates", "30-day starter plan"],
      why: "Consistent channels build credibility and a discovery surface.",
      deps: ["brand-identity"], growth: "Grow — audience" },
    { id: "analytics", stage: "Grow", name: "Analytics & Tracking", from: 500, weeks: [1, 1],
      assets: ["analytics"],
      includes: ["GA4 & events", "Conversion tracking", "Simple dashboard"],
      why: "You can't grow what you can't measure.",
      deps: ["website"], growth: "Grow — measurement" },
    { id: "marketing", stage: "Grow", name: "Marketing Campaign", from: 1800, weeks: [3, 4],
      assets: ["campaign"],
      includes: ["Channel strategy", "Creative & copy", "Launch & first optimisation"],
      why: "A predictable engine for qualified, ready-to-buy conversations.",
      deps: ["website", "analytics"], growth: "Grow — pipeline" },
  ];

  // Assets the client may already own (inventory step). key maps to module.assets.
  const ASSETS = [
    { key: "logo", label: "Logo", icon: "pen-tool" },
    { key: "colors", label: "Brand colors", icon: "palette" },
    { key: "website", label: "Website", icon: "layout-grid" },
    { key: "social", label: "Social media pages", icon: "share-2" },
    { key: "gbp", label: "Google Business Profile", icon: "map-pin" },
    { key: "crm", label: "CRM", icon: "route" },
    { key: "email", label: "Email marketing", icon: "mail" },
    { key: "analytics", label: "Analytics", icon: "line-chart" },
  ];

  const PLANS = {
    foundation: { id: "foundation", name: "Foundation", tag: "Starter", blurb: "The essentials — configured to skip what you already have.",
      modules: ["brand-identity", "website", "gbp", "analytics", "social"] },
    launch: { id: "launch", name: "Launch", tag: "Popular", blurb: "Go to market with brand, site and core automation.",
      modules: ["brand-identity", "website", "crm", "automation", "analytics", "social", "gbp"] },
    transform: { id: "transform", name: "Transform", tag: "", blurb: "Rebrand, rebuild and overhaul operations.",
      modules: ["brand-identity", "website", "landing-page", "crm", "automation", "analytics", "marketing", "gbp", "social"] },
    partner: { id: "partner", name: "Growth Partner", tag: "Retainer", blurb: "Ongoing brand, build, automate & grow.",
      modules: ["brand-identity", "website", "crm", "automation", "analytics", "marketing", "landing-page", "social", "gbp"] },
  };

  const GOALS = [
    { id: "launch", label: "Launch a new business", icon: "rocket" },
    { id: "leads", label: "Get more qualified leads", icon: "trending-up" },
    { id: "automate", label: "Automate my operations", icon: "workflow" },
    { id: "rebrand", label: "Modernize my brand", icon: "sparkles" },
    { id: "scale", label: "Scale what's working", icon: "line-chart" },
  ];

  // Assessment: each question scores a loop dimension 0..100.
  const ASSESSMENT = [
    { id: "brand", dim: "Brand", q: "How strong and consistent is your brand today?",
      options: [["Weak / inconsistent", 20], ["It's okay", 55], ["Strong & consistent", 90]] },
    { id: "web", dim: "Build", q: "How well does your website convert visitors?",
      options: [["No site / outdated", 15], ["Works, doesn't convert", 50], ["Converts well", 90]] },
    { id: "leads", dim: "Grow", q: "How predictable is your lead flow?",
      options: [["Unpredictable", 20], ["Some months", 55], ["Predictable pipeline", 90]] },
    { id: "ops", dim: "Automate", q: "How automated are your operations & follow-up?",
      options: [["All manual", 15], ["Partly", 50], ["Mostly automated", 90]] },
    { id: "data", dim: "Grow", q: "Can you measure what drives growth?",
      options: [["No tracking", 20], ["Basic", 55], ["Clear dashboards", 90]] },
  ];

  const PACE = [
    { id: "fast", label: "Fast-track", sub: "All at once, sooner" },
    { id: "phased", label: "Phased", sub: "Staged over time" },
  ];

  // Rich editorial content per module — the layered, plain-language catalog.
  // Layer 1 outcome + promise · Layer 2/3 deliverables (name + plain explanation)
  // · business impact · who's responsible · future upgrades · investment range.
  const CONTENT = {
    "brand-identity": {
      outcome: "A Brand That Earns Instant Trust",
      promise: "Look established and premium so customers choose you before they even pick up the phone.",
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
      impact: { value: "A premium identity lets you charge more and be remembered.", results: "Higher perceived value, stronger recall, easier referrals.", complexity: "Low — mostly your time in the workshop.", future: "Becomes the foundation every website, campaign and deck is built on.", next: "Professional Business Website" },
      resp: { bl: ["Facilitate discovery", "Design all brand assets", "Deliver source files & guidelines"], you: ["Share business goals & examples you like", "Give timely feedback", "Approve final direction"] },
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
      impact: { value: "Keeps hard-won recognition while looking current.", results: "A cleaner, more credible look for less.", complexity: "Low.", future: "A stepping stone to a full identity when you're ready.", next: "Professional Business Website" },
      resp: { bl: ["Audit current assets", "Refine and re-export", "Deliver mini guideline"], you: ["Send existing files", "Approve refinements"] },
      upgrades: ["Full Brand Identity", "Brand guidelines expansion"],
    },
    "website": {
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
      impact: { value: "Your website is the engine that turns attention into booked calls.", results: "More enquiries from the same traffic; a credible first impression.", complexity: "Medium — needs your content & feedback.", future: "The hub every campaign, automation and landing page plugs into.", next: "CRM & Pipeline Setup" },
      resp: { bl: ["Strategy, design & build", "SEO, speed & security setup", "Train your team"], you: ["Provide copy & imagery (or brief us)", "Review at each milestone", "Approve go-live"] },
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
      impact: { value: "A focused page converts paid traffic far better than a homepage.", results: "Lower cost per lead; higher campaign ROI.", complexity: "Low.", future: "A repeatable template for every future campaign.", next: "Marketing Campaign" },
      resp: { bl: ["Strategy, design & build", "CRM wiring"], you: ["Share the offer & audience", "Approve the page"] },
      upgrades: ["Multi-variant testing", "Campaign landing-page library"],
    },
    "crm": {
      outcome: "Never Lose Another Lead",
      promise: "See and manage every opportunity in one place so nothing slips through the cracks.",
      range: [1500, 3200],
      deliverables: [
        ["Pipeline & Stages", "A clear deal flow so you always know where every opportunity stands."],
        ["Lead Capture Wiring", "Every form, call and message lands in your CRM automatically."],
        ["Dashboards", "See pipeline value, conversion and what needs attention at a glance."],
        ["Team Onboarding", "We train your team so the CRM actually gets used."],
      ],
      impact: { value: "Stop leads slipping through the cracks — manage every opportunity.", results: "Faster follow-up, higher close rate, clear pipeline visibility.", complexity: "Medium.", future: "The backbone that automation and reporting build on.", next: "Automation & Follow-up" },
      resp: { bl: ["Configure CRM & pipeline", "Wire lead sources", "Train the team"], you: ["Share your sales process", "Attend onboarding", "Adopt the workflow"] },
      upgrades: ["Advanced automation", "Sales reporting suite", "Quoting & proposals"],
    },
    "automation": {
      outcome: "Your Operations, Running Themselves",
      promise: "Respond in minutes not days and remove hours of manual admin every week.",
      range: [1200, 2800],
      deliverables: [
        ["Follow-up Sequences", "Automatic, timely follow-up so leads never go cold."],
        ["Booking & Reminders", "Self-service scheduling with reminders that cut no-shows."],
        ["Tool Integrations", "Your apps talk to each other so data flows without copy-paste."],
        ["Workflow Automations", "The repetitive tasks eating your week, handled automatically."],
      ],
      impact: { value: "Respond faster and reclaim hours of manual work.", results: "Minutes-not-days response, fewer no-shows, less admin.", complexity: "Medium.", future: "Compounds as you add more of your operations.", next: "Analytics & Tracking" },
      resp: { bl: ["Design & build automations", "Integrate your tools", "Document the flows"], you: ["Map current processes", "Provide tool access", "Test with us"] },
      upgrades: ["AI assistants", "Advanced ops automation", "Custom integrations"],
    },
    "gbp": {
      outcome: "Own Your Local Search",
      promise: "Become the obvious local choice when customers search near you.",
      range: [400, 900],
      deliverables: [
        ["Profile Setup / Optimise", "A complete, accurate profile that ranks and builds trust."],
        ["Categories & Posts", "Set up to appear for the searches that matter, with fresh posts."],
        ["Review Flow", "A simple system to earn more 5-star reviews on autopilot."],
      ],
      impact: { value: "The front door for local discovery and trust.", results: "More calls, directions and clicks from local search.", complexity: "Low.", future: "Feeds your broader local SEO and reputation.", next: "Social Presence Setup" },
      resp: { bl: ["Set up & optimise profile", "Build review flow"], you: ["Verify the listing", "Provide business details"] },
      upgrades: ["Local SEO programme", "Reputation management"],
    },
    "social": {
      outcome: "Channels That Build Credibility",
      promise: "Show up consistently so prospects trust you before the first conversation.",
      range: [600, 1400],
      deliverables: [
        ["Profile Setup", "Professional, on-brand profiles on the channels your customers use."],
        ["Content Templates", "Reusable templates so posting stays easy and consistent."],
        ["30-Day Starter Plan", "A ready-to-post plan so you launch with momentum."],
      ],
      impact: { value: "Consistent channels build credibility and a discovery surface.", results: "A trustworthy presence prospects can check.", complexity: "Low.", future: "The base for ongoing content and campaigns.", next: "Marketing Campaign" },
      resp: { bl: ["Set up & brand profiles", "Build templates & plan"], you: ["Provide brand assets", "Post the starter plan"] },
      upgrades: ["Managed content", "Paid social campaigns"],
    },
    "analytics": {
      outcome: "Know Exactly What Drives Growth",
      promise: "Measure what matters so every decision is backed by data, not guesses.",
      range: [500, 1100],
      deliverables: [
        ["GA4 & Events", "Track the actions that matter — enquiries, calls, bookings."],
        ["Conversion Tracking", "Know which channels and pages actually produce customers."],
        ["Simple Dashboard", "One clear view of performance, no spreadsheet gymnastics."],
      ],
      impact: { value: "You can't grow what you can't measure.", results: "Clear visibility into what's working and what to fix.", complexity: "Low.", future: "Powers smarter marketing and reporting.", next: "Marketing Campaign" },
      resp: { bl: ["Install & configure tracking", "Build dashboard"], you: ["Provide site access", "Tell us your key actions"] },
      upgrades: ["Advanced attribution", "Automated reporting"],
    },
    "marketing": {
      outcome: "A Predictable Pipeline of Customers",
      promise: "Turn strangers into qualified, ready-to-buy conversations — on repeat.",
      range: [1800, 4500],
      deliverables: [
        ["Channel Strategy", "We pick the channels most likely to reach your best customers."],
        ["Creative & Copy", "Ads and messages designed to stop the scroll and drive action."],
        ["Campaign Launch", "We launch, monitor and hand you a working engine."],
        ["First Optimisation", "We tune based on real results to improve cost per lead."],
      ],
      impact: { value: "A predictable engine for qualified, ready-to-buy conversations.", results: "A repeatable source of qualified pipeline.", complexity: "Medium.", future: "Scales as you invest more into what works.", next: "Growth Partner retainer" },
      resp: { bl: ["Strategy, creative & launch", "Monitor & optimise"], you: ["Set budget & goals", "Provide offer details", "Review results with us"] },
      upgrades: ["Ongoing growth retainer", "Multi-channel scaling"],
    },
  };

  // Why an estimate is a range, not a fixed price.
  const RANGE_WHY = [
    ["Business size", "More locations, products or team members mean more to set up."],
    ["Existing assets", "What you already have in good shape reduces the build — and the cost."],
    ["Integrations", "Connecting more tools and systems adds setup work."],
    ["Project complexity", "Custom features and deeper requirements shift the estimate up."],
  ];

  // Client's per-service choice → what BrightLoop will do.
  // choice: 'have' | 'upgrade' | 'need'  →  status: Keep | Improve | Replace | Create
  const CHOICES = [
    { id: "have",    label: "Already have it",  status: "Keep",    icon: "check-circle",
      note: "We'll review your existing asset and confirm it meets professional standards." },
    { id: "upgrade", label: "Upgrade existing",  status: "Improve", icon: "arrow-up-circle",
      note: "You have this — BrightLoop will improve or redesign it to a professional standard." },
    { id: "need",    label: "Build it for me",   status: "Create",  icon: "plus-circle",
      note: "You don't have this yet — BrightLoop will create it from scratch." },
  ];
  const STATUS_META = {
    Keep:    { tone: "success", desc: "Reviewed & kept as-is" },
    Improve: { tone: "cyan",    desc: "Improved to professional standard" },
    Replace: { tone: "warning", desc: "Rebuilt — current version needs replacing" },
    Create:  { tone: "blue",    desc: "Built for you from scratch" },
  };
  const choiceMeta = id => CHOICES.find(c => c.id === id);
  // 'upgrade' becomes Replace when the current asset is weak enough to warrant a rebuild.
  function statusFor(choice, inventoryVal) {
    if (choice === "have") return "Keep";
    if (choice === "need") return "Create";
    if (choice === "upgrade") return inventoryVal === "none" ? "Create" : "Improve";
    return "Create";
  }

  // ---- helpers ----
  const byId = id => MODULES.find(m => m.id === id);
  const content = id => CONTENT[id] || {};
  const rangeFor = m => (CONTENT[m.id] && CONTENT[m.id].range) || [m.from, Math.round(m.from * 1.9)];
  const fmt = n => "$" + n.toLocaleString("en-US");
  const fmtRange = ([lo, hi]) => fmt(lo) + "–" + fmt(hi);

  // cost contribution [lo,hi] by resolved status
  function contribution(m, status) {
    const [lo, hi] = rangeFor(m);
    if (status === "Keep") return [0, 0];
    if (status === "Improve") return [Math.round(lo * 0.45), Math.round(hi * 0.6)];
    if (status === "Replace") return [Math.round(lo * 0.7), Math.round(hi * 0.85)];
    return [lo, hi];
  }
  // presence of a module's assets in inventory: 'have' > 'weak' > 'none'
  function assetPresence(m, inventory) {
    const inv = inventory || {};
    const vals = (m.assets || []).map(a => inv[a] || "none");
    if (m.assets && m.assets.length && vals.every(v => v === "have")) return "have";
    if (vals.some(v => v === "have" || v === "weak")) return "weak";
    return "none";
  }
  const defaultChoice = (m, inventory) => { const p = assetPresence(m, inventory); return p === "have" ? "have" : p === "weak" ? "upgrade" : "need"; };

  // Single source of truth for the configured selection (used by configurator, roadmap, sales).
  function selectionOf(state) {
    const planMods = new Set(PLANS[state.plan].modules);
    (state.added || []).forEach(id => planMods.add(id));
    const choices = state.choices || {};
    const rows = [...planMods].map(id => byId(id)).filter(m => m && !m.upgrade).map(m => {
      const choice = choices[m.id] || defaultChoice(m, state.inventory);
      const status = statusFor(choice, assetPresence(m, state.inventory));
      return { m, choice, status, cost: contribution(m, status) };
    });
    const order = { Brand: 0, Build: 1, Automate: 2, Grow: 3 };
    rows.sort((a, b) => order[a.m.stage] - order[b.m.stage] || a.m.from - b.m.from);
    let lo = 0, hi = 0, savedLo = 0, savedHi = 0;
    rows.forEach(r => { lo += r.cost[0]; hi += r.cost[1]; if (r.status === "Keep") { const [rl, rh] = rangeFor(r.m); savedLo += rl; savedHi += rh; } });
    const active = rows.filter(r => r.status !== "Keep");
    const kept = rows.filter(r => r.status === "Keep");
    const weeksMax = active.reduce((s, r) => s + r.m.weeks[1], 0);
    const weeks = Math.max(1, Math.round(weeksMax * (state.pace === "phased" ? 0.7 : 0.55)));
    return { rows, active, kept, lo, hi, savedLo, savedHi, weeks };
  }

  // Given a base plan + owned asset keys, compute selection.
  // Returns modules with state: 'owned' | 'upgrade' | 'needed', and totals.
  function configure(planId, owned, extraSelected, removed) {
    const plan = PLANS[planId];
    const sel = new Set(plan.modules);
    (extraSelected || []).forEach(id => sel.add(id));
    const ownedSet = new Set(owned || []);
    const removedSet = new Set(removed || []);
    const rows = [];
    sel.forEach(id => {
      const m = byId(id); if (!m || m.upgrade) return;
      const isOwned = m.assets.length > 0 && m.assets.every(a => ownedSet.has(a));
      const partial = !isOwned && m.assets.some(a => ownedSet.has(a)) && m.assets.length > 1;
      let state = isOwned ? "owned" : "needed";
      if (removedSet.has(id)) state = "removed";
      rows.push({ module: m, state, partial });
    });
    // order by loop stage
    const order = { Brand: 0, Build: 1, Automate: 2, Grow: 3 };
    rows.sort((a, b) => order[a.module.stage] - order[b.module.stage] || a.module.from - b.module.from);
    const active = rows.filter(r => r.state === "needed");
    const fromTotal = active.reduce((s, r) => s + r.module.from, 0);
    const savedFrom = rows.filter(r => r.state === "owned").reduce((s, r) => s + r.module.from, 0);
    const weeks = active.reduce((s, r) => s + r.module.weeks[1], 0);
    return { rows, active, fromTotal, savedFrom, weeksMax: weeks };
  }

  function recommendPlan(scores, goalId) {
    const avg = Object.values(scores).reduce((a, b) => a + b, 0) / (Object.values(scores).length || 1);
    if (goalId === "launch" || avg < 40) return "foundation";
    if (goalId === "scale" || avg >= 72) return "partner";
    if (goalId === "automate" || avg < 60) return "launch";
    return "transform";
  }

  return { MODULES, ASSETS, PLANS, GOALS, ASSESSMENT, PACE, CONTENT, RANGE_WHY, CHOICES, STATUS_META, byId, content, rangeFor, choiceMeta, statusFor, contribution, assetPresence, defaultChoice, selectionOf, fmt, fmtRange, configure, recommendPlan };
})();
