"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@brightloop/ui";
import styles from "../scanner.module.css";

/**
 * The human review gate actions on a prospect package (approve | request revision |
 * reject). Posts to the internal review route; the decision is capability-gated and
 * recorded as an auditable event server-side. Nothing here sends or publishes.
 */
export function PackageReviewActions({ runId, decision }: { runId: string; decision: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{ quoteId: string; itemCount: number; outcome: string } | null>(null);

  const decide = useCallback(
    async (action: "approve" | "request_revision" | "reject") => {
      setBusy(action);
      setError(null);
      try {
        const res = await fetch("/api/internal/runtime/package-review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId, action, note: note.trim() || undefined }),
        });
        if (!res.ok) {
          setError(res.status === 403 ? "You do not have permission to review this package." : "The review action could not be recorded.");
          setBusy(null);
          return;
        }
        setNote("");
        router.refresh();
      } catch {
        setError("The review action could not be recorded.");
      } finally {
        setBusy(null);
      }
    },
    [runId, note, router],
  );

  const promote = useCallback(async () => {
    setBusy("promote");
    setError(null);
    try {
      const res = await fetch("/api/internal/runtime/package-promotion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const body = await res.json() as { quoteId?: string; itemCount?: number; outcome?: string };
      if (!res.ok || body.quoteId === undefined) {
        setError("The approved package could not be promoted.");
        return;
      }
      setPromotion({ quoteId: body.quoteId, itemCount: body.itemCount ?? 0, outcome: body.outcome ?? "created" });
    } catch {
      setError("The approved package could not be promoted.");
    } finally {
      setBusy(null);
    }
  }, [runId]);

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
      {decision === "approved" ? (
        <div className={styles.badgeRow}>
          <Button variant="secondary" onClick={promote} disabled={busy !== null}>
            {busy === "promote" ? "Creating draft…" : "Create draft quote"}
          </Button>
        </div>
      ) : null}
      {promotion !== null ? (
        <Alert tone="info" title={promotion.outcome === "already_promoted" ? "Already promoted" : "Draft quote created"}>
          Quote ID: {promotion.quoteId}. Promoted items: {promotion.itemCount}.
        </Alert>
      ) : null}
      {decision !== "pending" ? <span className={styles.stageReason}>Current decision: {decision.replace("_", " ")}. A new decision supersedes it.</span> : null}
      {error !== null ? (
        <Alert tone="warning" title="Could not record the decision">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
