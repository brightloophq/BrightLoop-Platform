/**
 * Serialize a value for safe embedding inside an inline
 * `<script type="application/ld+json">`.
 *
 * `JSON.stringify` does NOT escape `<`, `>`, `&`, or the U+2028 / U+2029 line
 * separators, so a value containing `</script>` (or those separators) could
 * break out of the tag and inject markup. This rewrites each to its `\uXXXX`
 * form — still valid JSON, but inert as HTML. Our JSON-LD input is moderated
 * CMS content (published portfolio / testimonials), so this is defence-in-depth
 * against a stored-XSS breakout, not a fix for an externally reachable hole.
 */
export function safeJsonLd(value: unknown): string {
  const json = JSON.stringify(value);
  let out = "";
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i);
    // '<' 0x3c, '>' 0x3e, '&' 0x26, and the U+2028 / U+2029 line separators.
    if (code === 0x3c || code === 0x3e || code === 0x26 || code === 0x2028 || code === 0x2029) {
      out += "\\u" + code.toString(16).padStart(4, "0");
    } else {
      out += json[i];
    }
  }
  return out;
}
