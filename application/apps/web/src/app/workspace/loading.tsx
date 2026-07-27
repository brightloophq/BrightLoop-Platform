/**
 * Workspace loading skeleton (Phase F · Sprint F3.5). Streams while any workspace
 * page's server component resolves. The shell (sidebar/topbar) persists in the
 * layout; only the content region shows this skeleton. Reduced-motion aware via
 * the shared SkeletonBlock primitive.
 */

import { SkeletonBlock } from "@brightloop/ui";
import styles from "./pages.module.css";

export default function WorkspaceLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className={styles.pageHead}>
        <div>
          <SkeletonBlock width="14rem" height="2rem" />
          <div style={{ marginTop: "var(--space-3)" }}><SkeletonBlock width="26rem" height="1rem" /></div>
        </div>
      </div>
      <div className={styles.metricGrid}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.metric}>
            <SkeletonBlock width="3.5rem" height="2.2rem" />
            <div style={{ marginTop: "var(--space-2)" }}><SkeletonBlock width="6rem" height="0.8rem" /></div>
          </div>
        ))}
      </div>
      <div className={styles.list} style={{ marginTop: "var(--space-5)" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.row}>
            <div className={styles.rowMain} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <SkeletonBlock width="18rem" height="1.1rem" />
              <SkeletonBlock width="28rem" height="0.8rem" />
            </div>
            <div className={styles.rowRight}><SkeletonBlock width="4.5rem" height="1.4rem" radius="var(--radius-pill)" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
