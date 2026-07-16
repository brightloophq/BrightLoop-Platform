import Link from "next/link";
import { Icon } from "./Icon";
import { pageWindow } from "./pageWindow";
import styles from "./Pagination.module.css";

export { pageWindow };

export interface PaginationProps {
  page: number;
  pages: number;
  /** Build the href for a page — keeps pagination link-based and deep-linkable. */
  hrefFor: (page: number) => string;
}

/**
 * Pagination — real <a> links, not buttons, so pages are crawlable,
 * shareable and work without JS (handoff §10.2 pagination).
 */
export function Pagination({ page, pages, hrefFor }: PaginationProps) {
  if (pages <= 1) return null;

  const prevDisabled = page <= 1;
  const nextDisabled = page >= pages;

  return (
    <nav className={styles.nav} aria-label="Pagination">
      <Link
        href={hrefFor(page - 1)}
        className={[styles.link, prevDisabled ? styles.disabled : null].filter(Boolean).join(" ")}
        aria-disabled={prevDisabled || undefined}
        tabIndex={prevDisabled ? -1 : undefined}
        rel="prev"
      >
        <Icon name="arrow-left" size={14} />
        Previous
      </Link>

      {pageWindow(page, pages).map((entry, i) =>
        entry === "…" ? (
          <span key={`gap-${i}`} className={styles.ellipsis} aria-hidden="true">
            …
          </span>
        ) : (
          <Link
            key={entry}
            href={hrefFor(entry)}
            className={[styles.link, entry === page ? styles.current : null]
              .filter(Boolean)
              .join(" ")}
            aria-current={entry === page ? "page" : undefined}
            aria-label={`Page ${entry}`}
          >
            {entry}
          </Link>
        ),
      )}

      <Link
        href={hrefFor(page + 1)}
        className={[styles.link, nextDisabled ? styles.disabled : null].filter(Boolean).join(" ")}
        aria-disabled={nextDisabled || undefined}
        tabIndex={nextDisabled ? -1 : undefined}
        rel="next"
      >
        Next
        <Icon name="arrow-right" size={14} />
      </Link>
    </nav>
  );
}
