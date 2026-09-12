"use client";

import { useState, useTransition } from "react";
import { Alert, Button } from "@brightloop/ui";
import { deleteTestimonial } from "../reputation-actions";
import styles from "../cms.module.css";

/**
 * Delete a testimonial.
 *
 * `deleteTestimonial` existed and was never wired to anything, so a row entered
 * by mistake could only be removed in the Supabase dashboard.
 *
 * TWO-STEP, NOT `window.confirm`. This is irreversible — the row is deleted
 * outright, not soft-deleted — so the destructive click is never the first one.
 * A native confirm() would be simpler but it is trivially dismissed by muscle
 * memory, is unstyleable, and cannot be exercised by a test; an inline
 * confirmation names what is about to be destroyed instead.
 *
 * PREFER UNPUBLISHING. Setting the status to Private hides a review from the
 * public site and keeps the record, which is almost always what someone wants —
 * so the confirmation says so rather than assuming they know.
 */
export function DeleteTestimonial({ id, author }: { id: string; author: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const destroy = () => {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const result = await deleteTestimonial(fd);
      // On success the page revalidates and this row disappears with it, so
      // there is no success state to render — only a failure worth surfacing.
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
      <Alert tone="danger" title={`Delete ${author}'s review permanently?`}>
        This cannot be undone. If you only want it off the public site, set its status to
        <strong> Private</strong> instead — that hides it and keeps the record.
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
