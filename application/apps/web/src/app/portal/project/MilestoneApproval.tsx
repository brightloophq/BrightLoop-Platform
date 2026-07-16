"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Textarea } from "@brightloop/ui";
import { approveMilestone, requestMilestoneRevision } from "../portal-actions";
import styles from "../../admin/cms.module.css";

/** Milestone approval — client_admin approves or requests revision (handoff §07). */
export function MilestoneApproval({ milestoneId }: { milestoneId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "revise">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function approve() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("id", milestoneId);
    const r = await approveMilestone(fd);
    setPending(false);
    if (r.ok) router.refresh();
    else setError(r.error ?? "Failed");
  }

  async function revise(formData: FormData) {
    setPending(true);
    setError(null);
    formData.set("id", milestoneId);
    const r = await requestMilestoneRevision(formData);
    setPending(false);
    if (r.ok) router.refresh();
    else setError(r.error ?? "Failed");
  }

  return (
    <div style={{ marginTop: "var(--space-3)" }}>
      {error ? (
        <div style={{ marginBottom: "var(--space-2)" }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
      {mode === "idle" ? (
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <Button variant="primary" size="sm" onClick={approve} loading={pending}>
            {pending ? "…" : "Approve milestone"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setMode("revise")} disabled={pending}>
            Request changes
          </Button>
        </div>
      ) : (
        <form action={revise} className={styles.form} noValidate>
          <div className={styles.formFull}>
            <Textarea label="What needs changing?" name="feedback" required />
          </div>
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" size="sm" loading={pending}>
              Send
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
