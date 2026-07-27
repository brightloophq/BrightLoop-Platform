"use client";

/**
 * Global search box (Phase F · Sprint F1). Pure ranking + grouping come from the
 * tested `lib/workspace/search` helpers; this component only binds the query to
 * the results. The index is built server-side from existing read models.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@brightloop/ui";
import { groupByKind, rankSearch, type SearchDoc } from "@/lib/workspace/search";
import styles from "../pages.module.css";

export function SearchBox({ index }: { index: SearchDoc[] }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => groupByKind(rankSearch(q, index)), [q, index]);

  return (
    <div>
      <input
        autoFocus
        aria-label="Search your workspace"
        placeholder="Search projects, reports, missions, approvals…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: "100%", padding: "var(--space-3) var(--space-4)", fontSize: "var(--fs-lg)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", color: "var(--ink)", outline: "none", marginBottom: "var(--space-5)" }}
      />
      {q.trim() === "" && <div className={styles.rowMeta}>Type to search across everything you can see.</div>}
      {q.trim() !== "" && groups.length === 0 && <div className={styles.rowMeta}>No matches for “{q}”.</div>}
      {groups.map((g) => (
        <section key={g.kind} className={styles.section}>
          <div className={styles.sectionHead}><span className={styles.sectionTitle} style={{ textTransform: "capitalize" }}>{g.kind}s</span></div>
          <div className={styles.list}>
            {g.items.map((it) => (
              <Link key={it.id} href={it.href} className={styles.row}>
                <div className={styles.rowMain}><div className={styles.rowTitle}>{it.title}</div><div className={styles.rowMeta}>{it.subtitle}</div></div>
                <Badge tone="neutral">{it.kind}</Badge>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
