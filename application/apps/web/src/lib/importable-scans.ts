/**
 * Which completed scans the Business Scan should offer as a baseline source.
 *
 * Pure on purpose: `scanner-data.ts` is `server-only`, and the rule for what
 * belongs in that list is worth testing on its own.
 */

/** The fields the selection turns on. Deliberately narrower than a scan DTO. */
export interface ScanChoice {
  id: string;
  label: string;
  completedAt: string | null;
}

interface Identified extends ScanChoice {
  /** Operator-typed business name, if the scan carried one. */
  businessName: string | null;
  /** The site that was scanned, if the scan carried one. */
  websiteUrl: string | null;
}

/**
 * What counts as "the same business" across scans.
 *
 * Prefers the operator-typed business name; falls back to the website's host so
 * `https://auxion.xyz` and `https://www.auxion.xyz/services` are not offered as
 * two different companies. A scan carrying neither keys on its own id, which
 * makes it unique — better a row that looks duplicated than two unrelated scans
 * silently collapsed into one.
 */
export function businessKeyFor(scan: {
  businessName: string | null;
  websiteUrl: string | null;
  id: string;
}): string {
  const name = scan.businessName?.trim().toLowerCase();
  if (name) return `name:${name}`;

  const url = scan.websiteUrl?.trim();
  if (url) {
    try {
      const host = new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase();
      return `host:${host.replace(/^www\./, "")}`;
    } catch {
      return `url:${url.toLowerCase()}`;
    }
  }
  return `scan:${scan.id}`;
}

/**
 * The newest completed scan per business, newest business first.
 *
 * ONE ENTRY PER BUSINESS. Re-scanning a site is the normal way to use the
 * scanner, so the list filled with the same domain repeated, and the rows were
 * told apart only by a date — which two scans run on the same day share. Every
 * older scan of a business is superseded for this purpose: importing one would
 * write a baseline already known to be stale.
 *
 * A scan with no completion time sorts last and so never out-ranks a dated one.
 */
export function newestPerBusiness(scans: readonly Identified[]): ScanChoice[] {
  const byRecency = [...scans].sort((a, b) =>
    (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
  );

  const newest = new Map<string, ScanChoice>();
  for (const scan of byRecency) {
    const key = businessKeyFor(scan);
    if (newest.has(key)) continue;
    newest.set(key, { id: scan.id, label: scan.label, completedAt: scan.completedAt });
  }
  return [...newest.values()];
}
