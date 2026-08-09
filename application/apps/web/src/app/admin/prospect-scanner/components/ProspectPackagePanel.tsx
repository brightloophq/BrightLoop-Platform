import { Alert, Badge, OperationalPanel, SectionRule } from "@brightloop/ui";
import { commercialBadgeStatus, type CommercialStatus, type ProspectPackageView } from "@/lib/prospect-scanner";
import { PackageReviewActions } from "./PackageReviewActions";
import styles from "../scanner.module.css";

/**
 * The Prospect Package command center (§ post-scan commercial).
 *
 * A single honest view of the whole package — core assessment, report, competitor
 * intelligence, proposal draft (with pricing state) and client narrative — plus the
 * deterministic readiness state and the human review gate. It renders NO artifact
 * content; it composes already-derived component statuses. Approval is a separate,
 * capability-gated action — a generated package is never shown as approved.
 */
export function ProspectPackagePanel({ pkg, runId }: { pkg: ProspectPackageView; runId: string }) {
  const badgeFor = (status: CommercialStatus | "complete"): string => (status === "complete" ? "completed" : commercialBadgeStatus(status));

  return (
    <OperationalPanel tone="anchor">
      <SectionRule index="12" label="Prospect package" meta="internal only · review gate" />

      <div className={styles.badgeRow} style={{ marginBottom: "var(--space-3)" }}>
        <Badge status={pkg.badge}>{pkg.stateLabel}</Badge>
      </div>

      <ul className={styles.packageList}>
        {pkg.components.map((c) => (
          <li key={c.key} className={styles.packageRow}>
            <span className={styles.packageLabel}>{c.label}</span>
            <span className={styles.packageStatus}>
              <Badge status={badgeFor(c.status)}>{c.statusLabel}</Badge>
              {c.note !== null ? <span className={styles.packageNote}>{c.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: "var(--space-3)" }}>
        <Alert tone={pkg.state === "blocked" || pkg.state === "rejected" ? "warning" : "info"} title="Review status">
          {pkg.reason}
        </Alert>
      </div>

      {pkg.canReview ? (
        <PackageReviewActions runId={runId} decision={pkg.reviewDecision} />
      ) : (
        <div className={styles.railFoot}>
          <span>Review unlocks once the package is complete</span>
          <span>Nothing is sent to the prospect</span>
        </div>
      )}
    </OperationalPanel>
  );
}
