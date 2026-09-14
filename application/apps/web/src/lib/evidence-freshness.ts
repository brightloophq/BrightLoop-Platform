/* =============================================================================
 * How old is this evidence?
 *
 * The Freshness column read backwards. It showed the `Last-Modified` response
 * header, which a STATIC 404 page sends and a dynamic 200 page does not — so
 * the pages that failed carried a confident timestamp while the three pages
 * actually captured read "unknown". On a surface whose entire job is showing
 * how far an assessment can be trusted, the evidence we hold looked weaker than
 * the evidence we never got.
 *
 * The data was right; the presentation conflated two different questions:
 *
 *   when did the PAGE last change   → Last-Modified, often absent
 *   when did WE look at it          → collectedAt, always known for a fetch
 *
 * Both are real, and they are not interchangeable — so this labels which one is
 * being shown rather than quietly substituting one for the other.
 * ========================================================================== */

export interface FreshnessInput {
  /** `Last-Modified` from the response, when the server sent one. */
  freshness: string | null;
  /** When the crawler fetched it. Null for a page that was never fetched. */
  collectedAt: string | null;
  /** Whether the page was actually captured. */
  state: string;
}

export interface FreshnessView {
  /** What to show in the cell. */
  label: string;
  /** The longer form, for a title attribute. */
  title: string;
}

/** Trim an ISO timestamp to the minute; seconds are noise in a ledger. */
function shortIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 16).replace("T", " ") + "Z";
}

/**
 * The freshness cell for one evidence item.
 *
 * A page we never fetched has no freshness worth asserting, whatever header a
 * 404 body happened to carry — reporting one would be the original bug in
 * reverse, dressing a failure as well-dated evidence.
 */
export function freshnessView(item: FreshnessInput): FreshnessView {
  const captured = item.state === "observed";

  if (!captured) {
    return {
      label: "not captured",
      title: "This page was never successfully fetched, so there is no evidence to date.",
    };
  }

  if (item.freshness) {
    return {
      label: shortIso(item.freshness),
      title: `Last-Modified reported by the server: ${item.freshness}`,
    };
  }

  if (item.collectedAt) {
    // Marked, not disguised: this is when WE looked, not when the page changed.
    return {
      label: `seen ${shortIso(item.collectedAt)}`,
      title:
        "The server sent no Last-Modified header, which is normal for a dynamically rendered page. " +
        `This is when the crawler fetched it: ${item.collectedAt}`,
    };
  }

  return { label: "unknown", title: "No Last-Modified header and no collection time recorded." };
}
