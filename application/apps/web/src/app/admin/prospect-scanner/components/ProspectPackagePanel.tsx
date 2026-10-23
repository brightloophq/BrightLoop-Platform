"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Badge, OperationalPanel, SectionRule } from "@brightloop/ui";
import { commercialBadgeStatus, readPackageReviewUpdate, resolvePackageReviewView, type PackageReviewSnapshot, type CommercialStatus, type ProspectPackageView } from "@/lib/prospect-scanner";
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
export function ProspectPackagePanel({ pkg: sourceProp, runId }: { pkg: ProspectPackageView; runId: string }) {
  const [source, setSource] = useState(sourceProp);
  const [snapshot, setSnapshot] = useState<PackageReviewSnapshot | null>(null);
  const propBinding = useRef(sourceProp.reviewBinding);
  useEffect(() => {
    const previous = propBinding.current;
    const next = sourceProp.reviewBinding;
    const sameVersions = previous !== null && next !== null && (["proposal", "narrative", "report", "competitor", "coreProposal"] as const).every((key) => {
      const a = previous[key]; const b = next[key];
      return a === null || b === null ? a === b : a.id === b.id && a.version === b.version && a.checksum === b.checksum;
    });
    if (sameVersions) return;
    propBinding.current = next;
    setSource(sourceProp);
    setSnapshot(null);
  }, [sourceProp]);

  useEffect(() => {
    const onPricingSaved = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail?.runId !== runId) return;
      const markReviewUnavailable = () => {
        setSource({ ...source, state: "blocked", stateLabel: "Review refresh required", badge: "failed",
          reason: "The proposal was saved, but the current review versions could not be loaded. Reload before reviewing or sharing this package.",
          reviewDecision: "pending", reviewBinding: null, canReview: false, clientReady: false });
        setSnapshot(null);
      };
      const saved = event.detail.saved;
      if (saved === null || typeof saved !== "object") { markReviewUnavailable(); return; }
      const payload = saved as Record<string, unknown>;
      const content = payload["content"];
      if (typeof payload["id"] !== "string" || typeof payload["version"] !== "number" || content === null || typeof content !== "object") { markReviewUnavailable(); return; }
      const envelope = content as Record<string, unknown>;
      if (envelope["commercialState"] !== "priced" && envelope["commercialState"] !== "needs_pricing") { markReviewUnavailable(); return; }
      let review;
      try { review = readPackageReviewUpdate(payload["review"]); } catch { markReviewUnavailable(); return; }
      const binding = review.currentBinding;
      if (binding === null || binding.proposal.id !== payload["id"] || binding.proposal.version !== payload["version"]) { markReviewUnavailable(); return; }
      const previous = source.reviewBinding;
      if (previous === null || (["narrative", "report", "competitor", "coreProposal"] as const).some((key) => {
        const a = previous[key]; const b = binding[key];
        return a === null || b === null ? a !== b : a.id !== b.id || a.version !== b.version || a.checksum !== b.checksum;
      })) {
        markReviewUnavailable();
        return;
      }
      const pricingRequired = envelope["commercialState"] !== "priced";
      const nextSource: ProspectPackageView = {
        ...source,
        reviewBinding: binding,
        pricingRequired,
        components: source.components.map((component) => component.key === "proposal"
          ? { ...component, note: pricingRequired ? "Pricing required" : "Pricing complete" }
          : component),
      };
      propBinding.current = binding;
      setSource(nextSource);
      setSnapshot({ source: nextSource, review });
    };
    window.addEventListener("auxion:proposal-pricing-saved", onPricingSaved);
    return () => window.removeEventListener("auxion:proposal-pricing-saved", onPricingSaved);
  }, [runId, source]);

  const pkg = resolvePackageReviewView(source, snapshot);
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
        <Alert tone={pkg.state === "blocked" || pkg.state === "rejected" || (pkg.state === "approved" && pkg.pricingRequired) ? "warning" : "info"} title="Review status">
          {pkg.reason}
        </Alert>
      </div>

      {pkg.canReview && pkg.reviewBinding ? (
        <PackageReviewActions runId={runId} decision={pkg.reviewDecision} expectedBinding={pkg.reviewBinding}
          onReviewed={(review) => {
            setSnapshot({ source, review });
            window.dispatchEvent(new CustomEvent("auxion:commercial-review-updated", { detail: { runId } }));
          }}
          onReviewConflict={() => {
            setSnapshot({ source, review: null });
            window.dispatchEvent(new CustomEvent("auxion:commercial-review-updated", { detail: { runId } }));
          }} />
      ) : (
        <div className={styles.railFoot}>
          <span>Review unlocks once the package is complete</span>
          <span>Nothing is sent to the prospect</span>
        </div>
      )}
    </OperationalPanel>
  );
}
