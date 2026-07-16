/* BrightLoop — Reputation Platform data layer.
   Scalable, CMS-shaped schema for Portfolio + Testimonials.
   Exposes window.BL_REP. Designed to scale to hundreds of projects /
   thousands of reviews: everything is list-driven, filter/search/sort are
   pure functions, publish-gating is centralized.

   INTEGRITY RULE: never fabricate business results. Result metrics
   (leadsGenerated, revenueGrowth, …) are OPTIONAL and default to
   undisclosed. Only PROJECT FACTS (timeline, deliverables, services,
   platform, dates) are shown by default. Seed content below is SAMPLE
   copy for the prototype — replace via the Admin CMS.
*/
(function () {
  // ---- Controlled vocabularies (filter facets) ----------------------------
  const FACETS = {
    industry: ["Agriculture", "Home Services", "Professional Services", "Retail & E-commerce", "Hospitality", "Health & Wellness", "Non-profit", "Technology"],
    size: ["Solo / Founder", "Micro (2–10)", "Small (11–50)", "Mid-market (51–250)"],
    service: ["Brand", "Build", "Automate", "Grow"],
    country: ["Jamaica", "United States", "Canada", "United Kingdom", "Trinidad & Tobago"],
    year: [2026, 2025, 2024, 2023],
    budget: ["Under $2K", "$2K–$5K", "$5K–$10K", "$10K–$25K", "$25K+"],
    tech: ["Webflow", "WordPress", "Shopify", "Next.js", "HubSpot", "Airtable", "Zapier", "Make", "Google Workspace", "Meta Ads", "Klaviyo", "Notion"],
  };

  // ---- Publish states -------------------------------------------------------
  const PUBLISH = {
    featured: { label: "Featured", tone: "cyan", public: true, note: "Approved & highlighted across the site." },
    public: { label: "Public", tone: "success", public: true, note: "Live on the public website." },
    draft: { label: "Draft", tone: "warning", public: false, note: "Work in progress — not visible publicly." },
    private: { label: "Private", tone: "neutral", public: false, note: "Client has not approved public display." },
  };

  const AWARDS = {
    featured_project: { label: "Featured Project", icon: "star" },
    editors_choice: { label: "Editor's Choice", icon: "award" },
    most_innovative: { label: "Most Innovative", icon: "lightbulb" },
    highest_roi: { label: "Highest ROI", icon: "trending-up" },
    client_favourite: { label: "Client Favourite", icon: "heart" },
  };

  // Result-metric definitions — rendered ONLY where disclosed:true and a value exists.
  const METRIC_DEFS = [
    { key: "leadsGenerated", label: "Leads Generated", icon: "users", unit: "" },
    { key: "conversionLift", label: "Conversion Improvement", icon: "mouse-pointer-click", unit: "%" },
    { key: "timeSaved", label: "Time Saved", icon: "clock", unit: "" },
    { key: "revenueGrowth", label: "Revenue Growth", icon: "trending-up", unit: "%" },
    { key: "seoLift", label: "SEO Improvement", icon: "search", unit: "" },
    { key: "automationSavings", label: "Automation Savings", icon: "workflow", unit: "" },
  ];

  // Media kinds the platform supports.
  const MEDIA_KINDS = ["image", "video", "youtube", "loom", "audio", "pdf", "website"];

  // ---- Projects -------------------------------------------------------------
  // NOTE: metrics.disclosed=false everywhere by default — no fabricated results.
  const PROJECTS = [
    {
      id: "p_greenhouse", slug: "new-greenhouse", name: "The New Greenhouse", client: "The New Greenhouse",
      industry: "Agriculture", size: "Micro (2–10)", country: "Jamaica", year: 2026,
      services: ["Brand", "Build", "Grow"], budget: "$5K–$10K", tech: ["Webflow", "Google Workspace", "Meta Ads"],
      platform: "Webflow", timeline: "7 weeks", deliverablesCount: 14, completedDate: "2026-05-18", projectStatus: "Live",
      publish: "featured", featuredOnHome: true, awards: ["featured_project", "client_favourite"],
      liveUrl: "https://thenewgreenhouseja.com", permissionLivePreview: true,
      tags: ["local", "sustainability", "farm-to-table", "identity"],
      summary: "A grounded identity and conversion-first site for a Jamaican urban-farming venture bringing fresh produce to local kitchens.",
      challenge: "The New Greenhouse had strong word-of-mouth demand but no cohesive brand or online presence — enquiries lived in DMs and paper notes, and the offer was hard to explain to new customers.",
      approach: "We built a warm, earthy brand system, then a single-page Webflow site that explains the produce boxes, tells the origin story, and routes orders through a simple form into a shared inbox and calendar.",
      heroSlot: "rep-hero-greenhouse",
      gallerySlots: ["rep-greenhouse-1", "rep-greenhouse-2", "rep-greenhouse-3"],
      media: [
        { kind: "image", label: "Homepage", slot: "rep-greenhouse-1" },
        { kind: "image", label: "Produce box system", slot: "rep-greenhouse-2" },
        { kind: "website", label: "Live site", url: "https://thenewgreenhouseja.com" },
        { kind: "pdf", label: "Brand guidelines (PDF)", url: "#" },
      ],
      metrics: { disclosed: false },
      testimonialId: "t_greenhouse",
      seo: {
        title: "The New Greenhouse — Brand & Website Case Study | BrightLoop",
        description: "How BrightLoop built a farm-to-table brand identity and conversion-first Webflow site for The New Greenhouse, a Jamaican urban-farming venture.",
        ogImage: "rep-hero-greenhouse",
      },
    },
    {
      id: "p_polishedpro", slug: "polishedpro-cleaners", name: "PolishedPro Cleaners", client: "PolishedPro Cleaners",
      industry: "Home Services", size: "Micro (2–10)", country: "Jamaica", year: 2025,
      services: ["Brand", "Build", "Automate"], budget: "$10K–$25K", tech: ["WordPress", "Airtable", "Zapier", "Google Workspace"],
      platform: "WordPress", timeline: "9 weeks", deliverablesCount: 19, completedDate: "2025-11-02", projectStatus: "Complete",
      publish: "featured", featuredOnHome: true, awards: ["most_innovative"],
      liveUrl: "https://example.com/polishedpro", permissionLivePreview: true,
      tags: ["cleaning", "booking", "automation", "local"],
      summary: "A trustworthy brand and an automated booking-to-dispatch system for a residential & commercial cleaning company.",
      challenge: "Bookings came by phone and were tracked on a whiteboard. Double-bookings and missed follow-ups were costing jobs, and the brand looked informal next to national competitors.",
      approach: "We refreshed the brand, built a WordPress site with an online quote-and-book flow, and wired an Airtable + Zapier pipeline that schedules crews, confirms by SMS, and nudges for reviews after each clean.",
      heroSlot: "rep-hero-polishedpro",
      gallerySlots: ["rep-polishedpro-1", "rep-polishedpro-2"],
      media: [
        { kind: "image", label: "Booking flow", slot: "rep-polishedpro-1" },
        { kind: "loom", label: "Automation walkthrough (Loom)", url: "#" },
        { kind: "website", label: "Live site", url: "https://example.com/polishedpro" },
      ],
      metrics: { disclosed: false },
      testimonialId: "t_polishedpro",
      seo: {
        title: "PolishedPro Cleaners — Booking Automation Case Study | BrightLoop",
        description: "BrightLoop rebranded PolishedPro Cleaners and built an automated booking-to-dispatch system on WordPress, Airtable and Zapier.",
        ogImage: "rep-hero-polishedpro",
      },
    },
    {
      id: "p_meridian", slug: "meridian-studio", name: "Meridian Studio", client: "Meridian Studio",
      industry: "Professional Services", size: "Small (11–50)", country: "United States", year: 2025,
      services: ["Brand", "Build", "Automate", "Grow"], budget: "$25K+", tech: ["Next.js", "HubSpot", "Notion"],
      platform: "Next.js", timeline: "12 weeks", deliverablesCount: 27, completedDate: "2025-09-14", projectStatus: "Ongoing",
      publish: "public", featuredOnHome: true, awards: ["highest_roi"],
      liveUrl: "https://example.com/meridian", permissionLivePreview: true,
      tags: ["consulting", "rebrand", "crm", "pipeline"],
      summary: "A full rebrand, marketing site and intake-to-CRM automation that turned a referral-only firm into a bookable pipeline.",
      challenge: "A respected consultancy relied entirely on referrals with no way to capture or nurture inbound interest, and their brand no longer matched the calibre of their work.",
      approach: "The full loop: new identity, a Next.js marketing site, and an automated intake flow feeding HubSpot with lead scoring and sequenced follow-up — so every enquiry is captured and worked.",
      heroSlot: "rep-hero-meridian",
      gallerySlots: ["rep-meridian-1", "rep-meridian-2"],
      media: [
        { kind: "image", label: "Brand system", slot: "rep-meridian-1" },
        { kind: "youtube", label: "Case study film", url: "https://www.youtube.com/embed/dQw4w9WgXcQ" },
        { kind: "website", label: "Live site", url: "https://example.com/meridian" },
      ],
      metrics: { disclosed: false },
      testimonialId: "t_meridian",
      seo: {
        title: "Meridian Studio — Full Growth System Case Study | BrightLoop",
        description: "BrightLoop delivered brand, website and CRM automation for Meridian Studio, converting a referral-only consultancy into a predictable pipeline.",
        ogImage: "rep-hero-meridian",
      },
    },
    {
      id: "p_harbor", slug: "harbor-and-co", name: "Harbor & Co", client: "Harbor & Co",
      industry: "Hospitality", size: "Small (11–50)", country: "United Kingdom", year: 2024,
      services: ["Build", "Automate"], budget: "$10K–$25K", tech: ["Shopify", "Klaviyo", "Make"],
      platform: "Shopify", timeline: "8 weeks", deliverablesCount: 16, completedDate: "2024-12-06", projectStatus: "Complete",
      publish: "public", featuredOnHome: false, awards: [],
      liveUrl: "https://example.com/harbor", permissionLivePreview: true,
      tags: ["hospitality", "ecommerce", "email", "retention"],
      summary: "A refined Shopify storefront and lifecycle email program for a boutique hospitality brand.",
      challenge: "A beloved venue's online shop was an afterthought — clunky checkout, no email program, and no way to bring visitors back between stays.",
      approach: "We rebuilt the storefront on Shopify, connected Klaviyo lifecycle flows, and automated post-stay sequences with Make so guests are gently invited back.",
      heroSlot: "rep-hero-harbor",
      gallerySlots: ["rep-harbor-1"],
      media: [
        { kind: "image", label: "Storefront", slot: "rep-harbor-1" },
        { kind: "audio", label: "Client interview (audio)", url: "#" },
        { kind: "website", label: "Live site", url: "https://example.com/harbor" },
      ],
      metrics: { disclosed: false },
      testimonialId: "t_harbor",
      seo: {
        title: "Harbor & Co — Shopify & Lifecycle Email Case Study | BrightLoop",
        description: "BrightLoop rebuilt Harbor & Co's Shopify storefront and lifecycle email program for a boutique hospitality brand.",
        ogImage: "rep-hero-harbor",
      },
    },
    {
      id: "p_verdant", slug: "verdant-wellness", name: "Verdant Wellness", client: "Verdant Wellness Collective",
      industry: "Health & Wellness", size: "Micro (2–10)", country: "Canada", year: 2024,
      services: ["Brand", "Grow"], budget: "$5K–$10K", tech: ["WordPress", "Meta Ads", "Notion"],
      platform: "WordPress", timeline: "6 weeks", deliverablesCount: 11, completedDate: "2024-07-22", projectStatus: "Complete",
      publish: "public", featuredOnHome: false, awards: ["editors_choice"],
      liveUrl: "", permissionLivePreview: false,
      tags: ["wellness", "identity", "content"],
      summary: "A calm, credible brand and content foundation for a multi-practitioner wellness collective.",
      challenge: "Five practitioners under one roof with five different looks and no shared story — clients were confused about what the collective actually offered.",
      approach: "We unified them under one warm brand, rebuilt the site, and set up a lightweight content system so each practitioner can publish without breaking the look.",
      heroSlot: "rep-hero-verdant",
      gallerySlots: ["rep-verdant-1"],
      media: [
        { kind: "image", label: "Brand & site", slot: "rep-verdant-1" },
      ],
      metrics: { disclosed: false },
      testimonialId: "t_verdant",
      seo: {
        title: "Verdant Wellness — Brand & Content Case Study | BrightLoop",
        description: "BrightLoop unified a multi-practitioner wellness collective under one brand and content system.",
        ogImage: "rep-hero-verdant",
      },
    },
    {
      id: "p_northwind", slug: "northwind-supply", name: "Northwind Supply", client: "Northwind Supply Co",
      industry: "Retail & E-commerce", size: "Mid-market (51–250)", country: "United States", year: 2023,
      services: ["Build", "Automate", "Grow"], budget: "$25K+", tech: ["Shopify", "HubSpot", "Zapier", "Klaviyo"],
      platform: "Shopify Plus", timeline: "14 weeks", deliverablesCount: 31, completedDate: "2023-10-30", projectStatus: "Complete",
      publish: "private", featuredOnHome: false, awards: [],
      liveUrl: "", permissionLivePreview: false,
      tags: ["ecommerce", "b2b", "operations"],
      summary: "A B2B commerce rebuild and operations automation for an industrial supply distributor.",
      challenge: "A large catalogue, manual quoting, and disconnected systems made ordering slow for trade customers.",
      approach: "We rebuilt on Shopify Plus with trade pricing, connected HubSpot for account management, and automated quote-to-order handoffs.",
      heroSlot: "rep-hero-northwind",
      gallerySlots: [],
      media: [],
      metrics: { disclosed: false },
      testimonialId: null,
      seo: {
        title: "Northwind Supply — B2B Commerce Case Study | BrightLoop",
        description: "A B2B commerce rebuild and operations automation for an industrial supply distributor.",
        ogImage: "rep-hero-northwind",
      },
    },
  ];

  // ---- Testimonials ---------------------------------------------------------
  // Category ratings: communication, quality, timeliness, value, professionalism.
  const TESTIMONIALS = [
    {
      id: "t_greenhouse", projectSlug: "new-greenhouse", author: "Kemar Bailey", role: "Founder", company: "The New Greenhouse",
      country: "Jamaica", date: "2026-05-24", publish: "featured", pinned: true, featuredOnHome: true,
      avatarSlot: "rep-av-greenhouse",
      overall: 5, categories: { communication: 5, quality: 5, timeliness: 5, value: 5, professionalism: 5 },
      quote: "They understood what we were building before we could fully explain it. The brand feels like us, and for the first time customers can actually find and order from us online.",
      media: [{ kind: "image", label: "Kemar at the farm", slot: "rep-tmedia-greenhouse" }],
    },
    {
      id: "t_polishedpro", projectSlug: "polishedpro-cleaners", author: "Danielle Foster", role: "Owner", company: "PolishedPro Cleaners",
      country: "Jamaica", date: "2025-11-10", publish: "featured", pinned: true, featuredOnHome: true,
      avatarSlot: "rep-av-polishedpro",
      overall: 5, categories: { communication: 5, quality: 5, timeliness: 4, value: 5, professionalism: 5 },
      quote: "The booking system changed how we run. No more whiteboard, no more double-bookings — and it quietly asks every happy customer for a review. It runs the parts of the business I used to dread.",
      media: [{ kind: "video", label: "Danielle's story", url: "#" }],
    },
    {
      id: "t_meridian", projectSlug: "meridian-studio", author: "Jordan Rivera", role: "Founder", company: "Meridian Studio",
      country: "United States", date: "2025-09-20", publish: "public", pinned: false, featuredOnHome: true,
      avatarSlot: "rep-av-meridian",
      overall: 5, categories: { communication: 5, quality: 5, timeliness: 4, value: 5, professionalism: 5 },
      quote: "BrightLoop didn't just redesign our website — they rebuilt how the whole business runs. We finally look and operate like the company we want to be.",
      media: [],
    },
    {
      id: "t_harbor", projectSlug: "harbor-and-co", author: "Sasha Bell", role: "Managing Director", company: "Harbor & Co",
      country: "United Kingdom", date: "2024-12-15", publish: "public", pinned: false, featuredOnHome: false,
      avatarSlot: "rep-av-harbor",
      overall: 5, categories: { communication: 5, quality: 5, timeliness: 5, value: 4, professionalism: 5 },
      quote: "The automation alone gave us back two days a week. It's the first agency that felt like an actual partner, not a vendor.",
      media: [],
    },
    {
      id: "t_verdant", projectSlug: "verdant-wellness", author: "Amara Osei", role: "Director", company: "Verdant Wellness Collective",
      country: "Canada", date: "2024-08-01", publish: "public", pinned: false, featuredOnHome: false,
      avatarSlot: "rep-av-verdant",
      overall: 4, categories: { communication: 5, quality: 5, timeliness: 4, value: 4, professionalism: 5 },
      quote: "For the first time all five of us feel like one practice. Clients get it now — and so do we.",
      media: [],
    },
  ];

  // ---- Pure helpers ---------------------------------------------------------
  const bySlug = (slug) => PROJECTS.find((p) => p.slug === slug) || null;
  const testimonialFor = (proj) => (proj && proj.testimonialId ? TESTIMONIALS.find((t) => t.id === proj.testimonialId) : null) || null;
  const isPublic = (item) => !!(PUBLISH[item.publish] && PUBLISH[item.publish].public);

  function publicProjects() { return PROJECTS.filter(isPublic); }
  function publicTestimonials() { return TESTIMONIALS.filter(isPublic); }
  function featuredProjects() { return PROJECTS.filter((p) => isPublic(p) && (p.publish === "featured" || p.featuredOnHome)); }
  function homeTestimonials() { return TESTIMONIALS.filter((t) => isPublic(t) && t.featuredOnHome); }

  // Average of the five category ratings.
  function avgCategory(t) {
    const v = Object.values(t.categories || {});
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : t.overall;
  }

  // Aggregate rating across public testimonials.
  function aggregate() {
    const list = publicTestimonials();
    const n = list.length || 1;
    const overall = list.reduce((s, t) => s + t.overall, 0) / n;
    const cats = {};
    ["communication", "quality", "timeliness", "value", "professionalism"].forEach((k) => {
      cats[k] = list.reduce((s, t) => s + (t.categories?.[k] || 0), 0) / n;
    });
    return { count: list.length, overall, cats };
  }

  // Filter + search + sort over the PUBLIC catalogue. Filters is a map of facet->Set/array.
  function query({ filters = {}, search = "", sort = "recent" } = {}) {
    let list = publicProjects();
    const has = (facet) => filters[facet] && filters[facet].length;
    if (has("industry")) list = list.filter((p) => filters.industry.includes(p.industry));
    if (has("size")) list = list.filter((p) => filters.size.includes(p.size));
    if (has("service")) list = list.filter((p) => p.services.some((s) => filters.service.includes(s)));
    if (has("country")) list = list.filter((p) => filters.country.includes(p.country));
    if (has("year")) list = list.filter((p) => filters.year.map(Number).includes(p.year));
    if (has("budget")) list = list.filter((p) => filters.budget.includes(p.budget));
    if (has("tech")) list = list.filter((p) => p.tech.some((t) => filters.tech.includes(t)));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const hay = [p.name, p.client, p.industry, p.summary, ...(p.services || []), ...(p.tags || []), ...(p.tech || [])].join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    const order = { featured: 0, public: 1, draft: 2, private: 3 };
    if (sort === "recent") list = [...list].sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate));
    else if (sort === "featured") list = [...list].sort((a, b) => (order[a.publish] - order[b.publish]) || (new Date(b.completedDate) - new Date(a.completedDate)));
    else if (sort === "az") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }

  // "You may also like" — score by shared industry, service, business size.
  function related(proj, limit = 3) {
    if (!proj) return [];
    return publicProjects()
      .filter((p) => p.slug !== proj.slug)
      .map((p) => {
        let score = 0;
        if (p.industry === proj.industry) score += 3;
        score += p.services.filter((s) => proj.services.includes(s)).length;
        if (p.size === proj.size) score += 1;
        return { p, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.p);
  }

  // Paginate any list.
  function paginate(list, page = 1, perPage = 9) {
    const pages = Math.max(1, Math.ceil(list.length / perPage));
    const p = Math.min(Math.max(1, page), pages);
    return { page: p, pages, total: list.length, items: list.slice((p - 1) * perPage, p * perPage) };
  }

  // Schema.org structured data for a project (CreativeWork + Review).
  function schemaFor(proj) {
    const t = testimonialFor(proj);
    const data = {
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      name: proj.name + " — Case Study",
      about: proj.industry,
      creator: { "@type": "Organization", name: "BrightLoop" },
      dateCreated: proj.completedDate,
      keywords: (proj.tags || []).join(", "),
      url: "https://brightloop.co/portfolio/" + proj.slug,
    };
    if (t) {
      data.review = {
        "@type": "Review",
        reviewRating: { "@type": "Rating", ratingValue: t.overall, bestRating: 5 },
        author: { "@type": "Person", name: t.author },
        reviewBody: t.quote,
      };
    }
    return data;
  }

  function canonicalUrl(kind, slug) {
    const base = "https://brightloop.co";
    if (kind === "testimonials") return base + "/testimonials";
    if (kind === "case") return base + "/case-studies/" + slug;
    return base + "/portfolio/" + slug;
  }

  window.BL_REP = {
    FACETS, PUBLISH, AWARDS, METRIC_DEFS, MEDIA_KINDS,
    PROJECTS, TESTIMONIALS,
    bySlug, testimonialFor, isPublic,
    publicProjects, publicTestimonials, featuredProjects, homeTestimonials,
    avgCategory, aggregate, query, related, paginate, schemaFor, canonicalUrl,
  };
})();
