/**
 * Page window: first, last, current ±1, with ellipses.
 *
 * Lives in its own module (no JSX, no CSS import) so it is unit-testable in a
 * plain node environment — off-by-ones here are the classic pagination bug.
 */
export function pageWindow(current: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);

  const out: (number | "…")[] = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(pages - 1, current + 1);

  if (from > 2) out.push("…");
  for (let p = from; p <= to; p += 1) out.push(p);
  if (to < pages - 1) out.push("…");

  out.push(pages);
  return out;
}
