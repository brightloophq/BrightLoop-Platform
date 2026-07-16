"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Textarea } from "@brightloop/ui";
import { approveDeliverable, requestDeliverableRevision } from "../portal-actions";
import styles from "../../admin/cms.module.css";

/**
 * The J3 approval control — Approve or Request revision (handoff §07).
 *
 * Rendered only for client_admin on an in_review deliverable. client_member sees
 * a read-only note instead (they may comment, not approve — §01.3), enforced by
 * capability + RLS on the server regardless of what the UI shows.
 */
export function ApprovalControls({
  deliverableId,
  projectId,
}: {
  deliverableId: string;
  projectId: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "revise">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function approve() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("id", deliverableId);
    fd.set("projectId", projectId);
    const r = await approveDeliverable(fd);
    setPending(false);
    if (r.ok) router.refresh();
    else setError(r.error ?? "Failed");
  }

  async function revise(formData: FormData) {
    setPending(true);
    setError(null);
    formData.set("id", deliverableId);
    formData.set("projectId", projectId);
    const r = await requestDeliverableRevision(formData);
    setPending(false);
    if (r.ok) router.refresh();
    else setError(r.error ?? "Failed");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {error ? (
        <Alert tone="danger" title="Couldn't complete that">
          {error}
        </Alert>
      ) : null}

      {mode === "idle" ? (
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <Button variant="primary" size="md" onClick={approve} loading={pending}>
            {pending ? "Approving…" : "Approve"}
          </Button>
          <Button variant="secondary" size="md" onClick={() => setMode("revise")} disabled={pending}>
            Request a revision
          </Button>
        </div>
      ) : (
        <form action={revise} className={styles.form} noValidate>
          <div className={styles.formFull}>
            <Textarea
              label="What needs changing?"
              name="feedback"
              required
              hint="Be specific — this goes to the team and reopens the deliverable for a new version."
            />
          </div>
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" size="md" loading={pending}>
              {pending ? "Sending…" : "Send revision request"}
            </Button>
            <Button type="button" variant="ghost" size="md" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
