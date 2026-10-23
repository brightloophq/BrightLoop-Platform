"use client";

import type { CommercialReviewBinding } from "@brightloop/schema";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@brightloop/ui";
import { readPackageReviewUpdate, type PackageReviewUpdate } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

/**
 * The human review gate actions on a prospect package (approve | request revision |
 * reject). Posts to the internal review route; the decision is capability-gated and
 * recorded as an auditable event server-side. Nothing here sends or publishes.
 */
export function PackageReviewActions({ runId, decision, expectedBinding, onReviewed, onReviewConflict }: {
  runId: string; decision: string; expectedBinding: CommercialReviewBinding; onReviewed: (review: PackageReviewUpdate) => void;
  onReviewConflict: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = useCallback(
    async (action: "approve" | "request_revision" | "reject") => {
      setBusy(action);
      setError(null);
      try {
        const res = await fetch("/api/internal/runtime/package-review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId, action, expectedBinding, note: note.trim() || undefined }),
        });
        if (!res.ok) {
          if (res.status === 409) onReviewConflict();
          setError(res.status === 409 ? "The package changed. Reload the workspace and review the current versions." : res.status === 403 ? "You do not have permission to review this package." : "The review action could not be recorded.");
          setBusy(null);
          return;
        }
        // Persisted response, never optimistic: update the panel independently of
        // the full workspace's potentially suspended App Router refresh render.
        onReviewed(readPackageReviewUpdate(await res.json()));
        setNote("");
        router.refresh();
      } catch {
        setError("The review action could not be recorded.");
      } finally {
        setBusy(null);
      }
    },
    [runId, note, router, expectedBinding, onReviewed, onReviewConflict],
  );

  return (
    <div className={styles.reviewActions}>
      <label className={styles.reviewNoteLabel} htmlFor="package-review-note">
        Reviewer note (optional)
      </label>
      <textarea
        id="package-review-note"
        className={styles.reviewNote}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Context for this decision — kept on the internal audit trail."
      />
      <div className={styles.badgeRow}>
        <Button onClick={() => decide("approve")} disabled={busy !== null}>
          {busy === "approve" ? "Approving…" : "Approve"}
        </Button>
        <Button variant="secondary" onClick={() => decide("request_revision")} disabled={busy !== null}>
          {busy === "request_revision" ? "Requesting…" : "Request revision"}
        </Button>
        <Button variant="secondary" onClick={() => decide("reject")} disabled={busy !== null}>
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </Button>
      </div>
      {decision !== "pending" ? <span className={styles.stageReason}>Current decision: {decision.replace("_", " ")}. A new decision supersedes it.</span> : null}
      {error !== null ? (
        <Alert tone="warning" title="Could not record the decision">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
