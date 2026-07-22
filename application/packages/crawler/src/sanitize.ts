/* =============================================================================
 * Content sanitization (Phase C · Sprint C3 §7) — website content is UNTRUSTED.
 *
 * Every byte a site returns is data, never instruction. This module strips
 * executable/markup noise, removes control characters, normalizes whitespace,
 * caps length, hashes content deterministically, and FLAGS prompt-injection
 * markers (as data — it never acts on them). Nothing here lets website text
 * override Auxion system policy; downstream stages receive bounded, checksummed
 * text plus a flag that injection phrasing was present.
 * ========================================================================== */

import { hashContent } from "@brightloop/domain";

const SCRIPT_STYLE = /<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const TAG = /<[^>]+>/g;
// C0 control chars (tab/newline/CR kept, then collapsed by normalizeWhitespace) plus DEL.
const CTRL = [0, 8, 11, 12, 14, 31, 127];
const CONTROL_CHARS = new RegExp(
  "[" + String.fromCharCode(CTRL[0]!) + "-" + String.fromCharCode(CTRL[1]!) +
  String.fromCharCode(CTRL[2]!) + String.fromCharCode(CTRL[3]!) +
  String.fromCharCode(CTRL[4]!) + "-" + String.fromCharCode(CTRL[5]!) +
  String.fromCharCode(CTRL[6]!) + "]",
  "g",
);

/** Remove <script>/<style>/<noscript>/<template> blocks and HTML comments. */
export function stripActiveMarkup(html: string): string {
  return html.replace(SCRIPT_STYLE, " ").replace(HTML_COMMENT, " ");
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos|nbsp);|&#39;/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, d: string) => {
      const code = Number(d);
      return code >= 32 && code <= 0x10ffff ? safeFromCodePoint(code) : " ";
    });
}

function safeFromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return " ";
  }
}

/** Collapse runs of whitespace to single spaces and trim. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Remove control characters that have no place in extracted text. */
export function removeControlChars(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

/** Convert HTML to plain, bounded, sanitized visible text. */
export function htmlToText(html: string, maxChars: number): { text: string; truncated: boolean } {
  const stripped = stripActiveMarkup(html).replace(TAG, " ");
  const clean = normalizeWhitespace(removeControlChars(decodeEntities(stripped)));
  if (clean.length <= maxChars) return { text: clean, truncated: false };
  return { text: clean.slice(0, maxChars), truncated: true };
}

/** Cap and clean an attribute-derived string (title, meta, etc.). */
export function cleanInline(value: string, maxChars = 500): string {
  const clean = normalizeWhitespace(removeControlChars(decodeEntities(value)));
  return clean.length <= maxChars ? clean : clean.slice(0, maxChars);
}

/** Deterministic content checksum (FNV-1a via the domain hasher). */
export function contentChecksum(text: string): string {
  return hashContent({ text });
}

/**
 * Prompt-injection phrasings we FLAG (never obey). Matching text is treated as
 * ordinary page data; the flag lets downstream stages know the site attempted to
 * address the model. This list is defensive signalling, not a filter.
 */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore (?:all |the )?(?:previous|prior|above) (?:instructions|prompts?)/i,
  /disregard (?:all |the )?(?:previous|prior|above)/i,
  /you are now\b/i,
  /system prompt\b/i,
  /\bas an ai\b/i,
  /\bact as\b/i,
  /new instructions?:/i,
  /do not follow\b/i,
  /override (?:your |the )?(?:instructions|policy|rules)/i,
];

/** Return the injection markers present in text (as data — for observability). */
export function detectInjectionMarkers(text: string): string[] {
  const hits: string[] = [];
  for (const re of INJECTION_PATTERNS) {
    const m = re.exec(text);
    if (m) hits.push(m[0].toLowerCase().slice(0, 60));
  }
  return [...new Set(hits)];
}
