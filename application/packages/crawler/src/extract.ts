/* =============================================================================
 * Content extraction (Phase C · Sprint C3 §6) — deterministic, no JS execution.
 *
 * Turns raw HTML into a bounded, structured `PageExtract` using string/regex
 * parsing only — no DOM, no Playwright/Puppeteer, no script execution. Every text
 * field is sanitized and capped; links/headings are de-duplicated and stably
 * ordered so identical HTML yields an identical extract (checksummable).
 * ========================================================================== */

import { cleanInline, htmlToText, detectInjectionMarkers } from "./sanitize.js";

export interface PageForm {
  method: string;
  action: string;
  inputCount: number;
}

export interface SeoSignals {
  hasTitle: boolean;
  hasMetaDescription: boolean;
  hasCanonical: boolean;
  hasH1: boolean;
  h1Count: number;
  wordCount: number;
}

export interface AccessibilitySignals {
  imageCount: number;
  imagesWithAlt: number;
  hasLangAttribute: boolean;
  hasViewportMeta: boolean;
}

export interface PageExtract {
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  robotsMeta: string | null;
  language: string | null;
  headings: string[];
  visibleText: string;
  textTruncated: boolean;
  internalLinks: string[];
  externalLinks: string[];
  forms: PageForm[];
  emails: string[];
  phones: string[];
  socialLinks: string[];
  jsonLdTypes: string[];
  seo: SeoSignals;
  accessibility: AccessibilitySignals;
  /** Prompt-injection phrasings found in the page text — flagged, never obeyed. */
  injectionMarkers: string[];
}

const SOCIAL_HOSTS = ["facebook.com", "twitter.com", "x.com", "instagram.com", "linkedin.com", "youtube.com", "tiktok.com", "pinterest.com", "github.com"];

function firstMatch(re: RegExp, html: string): string | null {
  const m = re.exec(html);
  return m ? cleanInline(m[1]!) : null;
}

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`, "i");
  const alt = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["']`, "i");
  return firstMatch(re, html) ?? firstMatch(alt, html);
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).host.replace(/^www\./, "") === new URL(b).host.replace(/^www\./, "");
  } catch {
    return false;
  }
}

function absolute(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** Extract a bounded, structured view of an HTML page. Deterministic. */
export function extractPage(html: string, pageUrl: string, maxTextChars: number): PageExtract {
  const title = firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, html);
  const metaDescription = metaContent(html, "description");
  const robotsMeta = metaContent(html, "robots");
  const canonicalUrl =
    firstMatch(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i, html) ??
    firstMatch(/<link[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["']/i, html);
  const language = firstMatch(/<html[^>]*\blang=["']([^"']*)["']/i, html);

  // Headings h1–h3, de-duped, stable order.
  const headings: string[] = [];
  const headingRe = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  for (let m = headingRe.exec(html); m !== null && headings.length < 50; m = headingRe.exec(html)) {
    const text = cleanInline(m[1]!.replace(/<[^>]+>/g, " "), 200);
    if (text !== "" && !headings.includes(text)) headings.push(text);
  }

  // Links.
  const internal = new Set<string>();
  const external = new Set<string>();
  const social = new Set<string>();
  const emails = new Set<string>();
  const phones = new Set<string>();
  const linkRe = /<a[^>]*href=["']([^"']+)["']/gi;
  for (let m = linkRe.exec(html); m !== null; m = linkRe.exec(html)) {
    const raw = m[1]!.trim();
    if (raw.startsWith("mailto:")) { emails.add(cleanInline(raw.slice(7), 200).toLowerCase()); continue; }
    if (raw.startsWith("tel:")) { phones.add(cleanInline(raw.slice(4), 60)); continue; }
    const abs = absolute(raw, pageUrl);
    if (abs === null) continue;
    if (SOCIAL_HOSTS.some((h) => { try { return new URL(abs).host.replace(/^www\./, "").endsWith(h); } catch { return false; } })) social.add(abs);
    if (sameHost(abs, pageUrl)) internal.add(abs);
    else external.add(abs);
  }

  // Forms (count inputs; never submit).
  const forms: PageForm[] = [];
  const formRe = /<form([^>]*)>([\s\S]*?)<\/form>/gi;
  for (let m = formRe.exec(html); m !== null && forms.length < 25; m = formRe.exec(html)) {
    const attrs = m[1]!;
    const method = (/method=["']([^"']*)["']/i.exec(attrs)?.[1] ?? "get").toLowerCase();
    const action = cleanInline(/action=["']([^"']*)["']/i.exec(attrs)?.[1] ?? "", 300);
    const inputCount = (m[2]!.match(/<input\b/gi) ?? []).length;
    forms.push({ method, action, inputCount });
  }

  // JSON-LD @type values only (never the raw payload).
  const jsonLdTypes = new Set<string>();
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (let m = ldRe.exec(html); m !== null && jsonLdTypes.size < 25; m = ldRe.exec(html)) {
    for (const t of m[1]!.match(/"@type"\s*:\s*"([^"]+)"/g) ?? []) {
      const type = /"@type"\s*:\s*"([^"]+)"/.exec(t)?.[1];
      if (type) jsonLdTypes.add(cleanInline(type, 60));
    }
  }

  // Accessibility signals.
  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  const imagesWithAlt = images.filter((tag) => /\balt=["'][^"']*["']/i.test(tag)).length;

  const { text: visibleText, truncated: textTruncated } = htmlToText(bodyOf(html), maxTextChars);

  return {
    title,
    metaDescription,
    canonicalUrl: canonicalUrl === null ? null : absolute(canonicalUrl, pageUrl),
    robotsMeta,
    language,
    headings,
    visibleText,
    textTruncated,
    internalLinks: [...internal].sort().slice(0, 200),
    externalLinks: [...external].sort().slice(0, 200),
    forms,
    emails: [...emails].sort().slice(0, 50),
    phones: [...phones].sort().slice(0, 50),
    socialLinks: [...social].sort().slice(0, 50),
    jsonLdTypes: [...jsonLdTypes].sort(),
    seo: {
      hasTitle: title !== null && title !== "",
      hasMetaDescription: metaDescription !== null && metaDescription !== "",
      hasCanonical: canonicalUrl !== null,
      hasH1: /<h1[\s>]/i.test(html),
      h1Count: (html.match(/<h1[\s>]/gi) ?? []).length,
      wordCount: visibleText === "" ? 0 : visibleText.split(/\s+/).length,
    },
    accessibility: {
      imageCount: images.length,
      imagesWithAlt,
      hasLangAttribute: language !== null,
      hasViewportMeta: /<meta[^>]*name=["']viewport["']/i.test(html),
    },
    injectionMarkers: detectInjectionMarkers(visibleText),
  };
}

/** The <body> content, or the whole document when there is no explicit body. */
function bodyOf(html: string): string {
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return m ? m[1]! : html;
}
