"use client";

import { useState, useTransition } from "react";
import { Alert, Button } from "@brightloop/ui";
import { deleteProject, deleteTestimonial } from "../reputation-actions";
import styles from "../cms.module.css";

type Kind = "testimonial" | "project";

/**
 * Delete a review or a portfolio project.
 *
 * BOTH server actions were written and neither was ever wired to a button.
 * Reviews got one late; projects had none at all, so a case study entered by
 * mistake could only be removed in the Supabase dashboard. One component serves
 * both, picking the action by `kind` — the same shape ModerationControls
 * already uses for the identical pair.
 *
 * TWO-STEP, NOT `window.confirm`. This is irreversible — the row is deleted
 * outright, not soft-deleted — so the destructive click is never the first one.
 * A native confirm() would be simpler but it is trivially dismissed by muscle
 * memory, is unstyleable, and cannot be exercised by a test; an inline
 * confirmation names what is about to be destroyed instead.
 *
 * PREFER UNPUBLISHING. Setting the status to Private hides the row from the
 * public site and keeps the record, which is almost always what someone wants —
 * so the confirmation says so rather than assuming they know.
 */
export function DeleteRow({ kind, id, label }: { kind: Kind; id: string; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const action = kind === "testimonial" ? deleteTestimonial : deleteProject;
  const noun = kind === "testimonial" ? "review" : "case study";

  const destroy = () => {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const result = await action(fd);
      // On success the page revalidates and this row disappears with it, so
      // there is no success state to render — only a failure worth surfacing.
      // A delete that removed NOTHING now comes back as a failure too, rather
      // than as a silent no-op the reader has to infer from an unchanged list.
      if (!result.ok) {
        setError(result.error ?? "Failed to delete");
        setConfirming(false);
      }
    });
  };

  if (!confirming) {
    return (
      <>
        {error ? (
          <div className={styles.formFull}>
            <Alert tone="danger" title="Couldn't delete">
              {error}
            </Alert>
          </div>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          Delete
        </Button>
      </>
    );
  }

  return (
    <div className={styles.formFull}>
      <Alert tone="danger" title={`Delete ${label}'s ${noun} permanently?`}>
        This cannot be undone. If you only want it off the public site, set its status to
        <strong> Private</strong> instead — that hides it and keeps the record.
        {kind === "project" ? (
          <>
            {" "}
            Any review linked to this project stays, but loses the link.
          </>
        ) : null}
        <div className={styles.formActions}>
          <Button variant="primary" size="sm" loading={pending} onClick={destroy}>
            {pending ? "Deleting…" : "Yes, delete it"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
            Keep it
          </Button>
        </div>
      </Alert>
    </div>
  );
}
