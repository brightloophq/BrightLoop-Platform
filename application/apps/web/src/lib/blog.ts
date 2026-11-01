/* =============================================================================
 * Writing — the articles published at /blog.
 *
 * WHY THIS EXISTS AS DATA RATHER THAN MDX: the site has no markdown pipeline,
 * and adding one to publish three articles would be more machinery than
 * content. A typed structure keeps every article checkable by the compiler and
 * renders with the same components as the rest of the site.
 *
 * INTEGRITY: every article here describes how Auxion works or states a
 * verifiable fact about how websites are read by machines. There are no client
 * stories, no statistics, no cited studies and no attributed quotes, because
 * none of those could be sourced — and an invented one in a published article
 * is exactly the kind of claim a reader would have no way to check.
 * ========================================================================== */

export interface ArticleBlock {
  kind: "heading" | "paragraph" | "list";
  /** Heading or paragraph text; ignored for lists. */
  text?: string;
  /** List items. */
  items?: readonly string[];
}

export interface Article {
  slug: string;
  title: string;
  /** Meta description and the index card's summary — one sentence. */
  summary: string;
  /** ISO date. The day the article was published, not a fabricated backdate. */
  publishedAt: string;
  /** One-line statement of who the article is for. */
  audience: string;
  body: readonly ArticleBlock[];
}

const p = (text: string): ArticleBlock => ({ kind: "paragraph", text });
const h = (text: string): ArticleBlock => ({ kind: "heading", text });
const ul = (items: readonly string[]): ArticleBlock => ({ kind: "list", items });

export const ARTICLES: readonly Article[] = [
  {
    slug: "diagnose-before-quoting",
    title: "Why we scan a business before we quote it",
    summary:
      "A quote written before anyone has looked at the site, the funnel and the follow-up is a guess with a number on it. Here is what we look at first, and why.",
    publishedAt: "2026-09-14",
    audience: "Owners deciding who to hire for brand, web or automation work.",
    body: [
      p(
        "Most proposals for small-business web and marketing work are written from a conversation. The owner describes the problem, the agency describes a package, and a number appears at the bottom of a PDF. Nobody has looked at the thing being fixed. The number is a guess dressed as a quote.",
      ),
      p(
        "We do it the other way round. Before we scope anything we run a scan of what already exists — the public site, the paths a visitor can take through it, the ways an interested person can actually make contact, and what is measurable from the outside. The scope then answers something observed rather than something assumed.",
      ),
      h("What a scan actually looks at"),
      p(
        "The scan reads the site the way a machine reads it: no JavaScript execution, no assumptions, just what the pages return. It scores a set of capability categories, and each score carries the evidence and the formula that produced it, so any number can be recomputed by hand.",
      ),
      ul([
        "Website — does a structurally complete, reachable site exist across the paths people try?",
        "SEO — is the site legible to a search engine: title, description, canonical URL, one heading, structured data?",
        "Branding — is the brand presented consistently, and is there an organization record a machine can read?",
        "Trust — HTTPS, a published contact route, policy pages, security headers.",
        "Accessibility — alt text on images, a declared language, a responsive viewport.",
        "Content — is there enough substance on the page to sell from, and any signal that it is maintained?",
        "Lead capture — can an interested visitor become an enquiry without hunting?",
        "Customer journey — is there a path from interest to enquiry: services, pricing, about, internal links?",
        "Performance — how much weight the page ships.",
        "Social presence — are there real profiles linked from the site?",
      ]),
      h("What the scan refuses to do"),
      p(
        "A category with no supporting evidence is reported as unassessable, not as zero. This distinction matters more than it sounds. Absence of evidence is not evidence of absence: if nothing on a site says anything about how the business runs internally, the honest output is “not measurable from here”, not a bad score.",
      ),
      p(
        "The same rule applies to whole domains. Delivery — how work actually gets done once a client signs — leaves no trace on a public website. So a scan does not score it. We ask about it instead, in the conversation where it belongs, rather than inventing a number that would be indistinguishable from a measured one the moment it was written down.",
      ),
      h("Why the order matters to you"),
      p(
        "Diagnosing first changes what you are buying. Instead of a package chosen from a menu, the work is a response to specific, named gaps — and you can see the evidence for each one. If the scan finds that the site has no enquiry form on any page, that is a fact about your site, not an opinion about your marketing. Fixing it is measurable. So is not fixing it.",
      ),
      p(
        "It also changes what we can honestly promise. We will not quote for a rebrand because rebrands are what we sell; we will quote for a rebrand when the scan shows the brand is presented four different ways across the site and there is no organization record at all. Those are different conversations, and only one of them respects your budget.",
      ),
      h("What you get from the scan itself"),
      p(
        "A scan produces a read on each category with the evidence attached, a list of observed weaknesses and risks in priority order, and a statement of what could not be assessed and why. It is useful on its own even if you never hire anyone: most of the highest-priority findings on a small-business site are half-day fixes that nobody had written down.",
      ),
      p(
        "That is the point. The scan is a diagnosis, and a diagnosis you can act on without us is a more honest instrument than one that only ever concludes that you need us.",
      ),
    ],
  },
  {
    slug: "one-loop-not-four-projects",
    title: "The four disciplines are one loop, not four projects",
    summary:
      "A logo from one place, a website from another, a CRM nobody finished, and no way to tell which is working. Why that outcome is structural, and what changes when the four are built as one system.",
    publishedAt: "2026-09-14",
    audience: "Businesses that have bought brand, web and marketing work separately.",
    body: [
      p(
        "Here is the shape of the problem we see most often. A business buys a logo from a designer. A year later it buys a website from a web studio, which redraws the logo slightly because the original files were never handed over. Later still it buys a CRM subscription, which someone half-configures and nobody finishes. Then it buys ads, which send traffic to the website, which captures enquiries into an inbox, which nobody has time to work.",
      ),
      p(
        "Every one of those purchases was reasonable on its own. The result is four disconnected assets and no way to answer the only question that matters: which of them is producing anything?",
      ),
      h("Why this happens structurally"),
      p(
        "It happens because each vendor is scoped to their own deliverable and nobody is scoped to the seam between two. A designer is finished when the logo is approved. A web studio is finished when the site is live. Neither is responsible for whether the site actually uses the brand consistently, or whether an enquiry from the site ever reaches a system that follows it up. The seams are where the value leaks, and the seams are nobody's job.",
      ),
      p(
        "The second reason is measurement. Measurement is almost always bought last, which means the earlier decisions were made without it and cannot be evaluated afterwards. You cannot retrospectively learn whether the rebrand helped if nothing was recording before it.",
      ),
      h("The loop"),
      p("We work in four disciplines, and they are deliberately arranged as a loop rather than a list:"),
      ul([
        "Brand — the identity, voice and guidelines a business is recognised by.",
        "Build — the site and pages where that identity meets a visitor and a decision gets made.",
        "Automate — the capture, follow-up and workflow that turns an enquiry into a conversation instead of an unread email.",
        "Grow — the measurement, presence and campaigns that tell you which of the above is working, and feed that answer back into the brand.",
      ]),
      p(
        "Each one feeds the next, and the last one feeds the first. Brand without Build is a logo in a folder. Build without Automate is a form that fills an inbox. Automate without Grow is a machine nobody can evaluate. Grow without Brand is spend pointed at something forgettable.",
      ),
      h("You do not have to start at the beginning"),
      p(
        "A loop has no required entry point. Most businesses should start where it hurts most, which is rarely the logo. If enquiries are arriving and going cold, start with Automate. If traffic is arriving and leaving, start with Build. If nothing is arriving at all, start with Grow, and be honest about whether the site can convert what you send it.",
      ),
      p(
        "What matters is that whichever piece you start with is built to connect to the others, rather than built as a standalone deliverable that will need redoing when the next piece arrives. That is mostly a matter of decisions made early and cheaply: where the brand files live, who owns the domain and the accounts, whether the site emits the data a measurement layer will need, whether the forms write somewhere a CRM can read.",
      ),
      h("What it costs to ignore the seams"),
      p(
        "The expensive version of this is not any single purchase. It is the third rebuild, when a business discovers that the site cannot be extended, the CRM was configured around a process that changed, and the brand assets exist only as flattened images someone exported once. None of that is visible on the invoice for any individual project. It is the compound cost of four vendors each finishing at their own edge.",
      ),
      p(
        "Building the four as one system is not more expensive at the start. It is a different set of decisions at the start, most of which cost nothing extra if they are made before the work rather than after it.",
      ),
    ],
  },
  {
    slug: "what-lead-capture-means",
    title: "What “lead capture” actually means on a small business website",
    summary:
      "It is not a popup. It is whether an interested person can become an enquiry without hunting — and most sites fail it in three specific, fixable ways.",
    publishedAt: "2026-09-14",
    audience: "Anyone responsible for a small business website.",
    body: [
      p(
        "“Lead capture” has been claimed by popup vendors, so it is worth reclaiming. It does not mean interrupting a reader. It means this: a person who has decided they are interested can turn that decision into a message to you, right now, from wherever they are on the site, without going looking for how.",
      ),
      p(
        "That is a low bar and most small-business sites do not clear it. The failures are consistent, and each is a fixable defect rather than a strategy problem.",
      ),
      h("1. The contact route exists on one page only"),
      p(
        "The classic shape: a contact page with a form, and eight other pages with nothing. A visitor who becomes interested while reading a services page has to notice the navigation, decide to leave the page they were engaged with, and arrive on a blank form with none of the context they had a moment ago.",
      ),
      p(
        "The fix is not a popup. It is a published contact route on every page — an address in the footer at minimum, and a call to action at the end of any page that argues for something. A crawler reads this the same way a person does: if the only reachable contact detail is behind a click, the site reads as harder to contact than it is.",
      ),
      h("2. The form exists but goes nowhere"),
      p(
        "This is the failure nobody finds, because finding it requires submitting your own form and then checking whether anything arrived. Forms break quietly: a plugin update, an expired API key, a mail provider that starts filing your own notifications as spam, a recipient address belonging to someone who left.",
      ),
      p(
        "Two habits fix it permanently. Submit your own form once a month from a device that is not signed in to anything. And make the form write to somewhere durable — a database row, a CRM record — rather than only sending an email, so a mail failure cannot silently destroy an enquiry.",
      ),
      h("3. There is no direct address at all"),
      p(
        "Some sites publish only a form, on the theory that it keeps the inbox clean. It does. It also turns away every person who wanted to send a two-line question, forward your details to a colleague, or attach a brief. A published email address costs a small amount of spam and removes a real barrier for the people most ready to act.",
      ),
      p(
        "The same applies to a phone number if you answer it. If you do not answer it, do not publish it — an unanswered number does more damage than no number.",
      ),
      h("What good looks like"),
      ul([
        "A contact address published in the footer of every page, as a real mailto link.",
        "A form on the contact page that writes somewhere durable, and that you have personally submitted recently.",
        "A clear next step at the end of every page that makes an argument.",
        "A contact page that says what happens after you send — even if the answer is simply that a person reads it and replies.",
        "No dead controls: a booking widget that is not connected, or a form that reports success without sending anything, is worse than an honest note saying the channel is not live yet.",
      ]),
      h("Why this is worth doing before anything else"),
      p(
        "Every other improvement to a website is multiplied or destroyed by this one. More traffic to a site that cannot capture an enquiry produces more people who wanted to talk to you and could not. Better copy on a page with no next step produces a better-informed visitor who leaves. Fixing capture first is what makes the rest of the work measurable.",
      ),
      p(
        "It is also, almost always, the cheapest fix on the list. A footer address and a form that writes to a table is a morning's work. It is rarely the most interesting thing on a website roadmap, and it is nearly always the item with the highest return on the roadmap.",
      ),
    ],
  },
];

/**
 * The article's opening paragraph, for the index.
 *
 * A list of titles and one-line summaries is the thin index a reader cannot
 * judge from. The first paragraph is what they would read anyway on arriving,
 * so showing it is the standfirst a publication would print — not filler.
 */
export function openingParagraph(article: Article): string {
  return article.body.find((b) => b.kind === "paragraph")?.text ?? "";
}

/** Newest first — how the index and the sitemap both want them. */
export function articlesNewestFirst(): Article[] {
  return [...ARTICLES].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : a.slug < b.slug ? -1 : 1));
}

export function articleBySlug(slug: string): Article | null {
  return ARTICLES.find((a) => a.slug === slug) ?? null;
}

/** Visible words in an article — used for the reading estimate, nothing else. */
export function articleWordCount(article: Article): number {
  const words = article.body.flatMap((block) =>
    block.kind === "list" ? (block.items ?? []).flatMap((i) => i.split(/\s+/)) : (block.text ?? "").split(/\s+/),
  );
  return words.filter((w) => w.length > 0).length;
}

/** Whole minutes, at 200 words per minute, never less than one. */
export function readingMinutes(article: Article): number {
  return Math.max(1, Math.round(articleWordCount(article) / 200));
}
