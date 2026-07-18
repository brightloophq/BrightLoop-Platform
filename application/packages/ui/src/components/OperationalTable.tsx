import type { ReactNode } from "react";
import styles from "./OperationalTable.module.css";

export interface OperationalColumn<T> {
  key: string;
  header: ReactNode;
  /** Short label used for the stacked mobile layout (defaults to `key`). */
  label?: string;
  render: (row: T) => ReactNode;
  align?: "start" | "end";
  /** Hide this column entirely on the stacked mobile layout. */
  hideOnMobile?: boolean;
}

export interface OperationalTableProps<T> {
  columns: OperationalColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Visually-hidden description of the table for screen readers. */
  caption: string;
  className?: string;
}

/**
 * A dense, semantic operational table (desktop) that reflows into readable
 * stacked cards on mobile — the disciplined list surface for the command center,
 * not a wall of cards. Presentational + router-agnostic: put links inside a
 * column's `render`. Reused by every list module.
 */
export function OperationalTable<T>({ columns, rows, rowKey, caption, className }: OperationalTableProps<T>) {
  return (
    <div className={[styles.scroll, className].filter(Boolean).join(" ")}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={[c.align === "end" ? styles.end : null, c.hideOnMobile ? styles.hideMobile : null]
                  .filter(Boolean)
                  .join(" ")}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className={styles.row}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  data-label={c.label ?? c.key}
                  className={[c.align === "end" ? styles.end : null, c.hideOnMobile ? styles.hideMobile : null]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
