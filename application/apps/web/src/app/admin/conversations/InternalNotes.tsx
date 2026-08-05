"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@brightloop/ui";
import { addInternalNote } from "../../conversation-actions";
import styles from "../../chat.module.css";

export interface InternalNote {
  id: string;
  body: string;
  created_at: string;
  authorName: string;
}

/**
 * Internal notes — Auxion-only. This whole component renders on the admin
 * surface only; the underlying table has NO client RLS policy, so even if this
 * markup somehow reached a client it would return zero rows. The dashed warning
 * styling is a human safeguard: it must never look like the client-facing thread.
 */
export function InternalNotes({ conversationId, notes }: { conversationId: string; notes: InternalNote[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <div className={styles.noteZone}>
      <div className={styles.ctxSection}>Internal notes — not visible to the client</div>

      {notes.length === 0 ? (
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>No internal notes yet.</p>
      ) : (
        notes.map((n) => (
          <div key={n.id} className={styles.note}>
            <div>{n.body}</div>
            <div className={styles.meta}>
              <span className={styles.author}>{n.authorName}</span>
              <time dateTime={n.created_at}>{new Date(n.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</time>
            </div>
          </div>
        ))
      )}

      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add an internal note…"
          rows={2}
          aria-label="Internal note"
          style={{ flex: 1, resize: "none" }}
        />
        <Button
          variant="secondary"
          loading={pending}
          disabled={pending || body.trim().length === 0}
          onClick={async () => {
            setPending(true);
            const fd = new FormData();
            fd.set("conversationId", conversationId);
            fd.set("body", body.trim());
            const res = await addInternalNote(fd);
            setPending(false);
            if (res.ok) {
              setBody("");
              router.refresh();
              toast("Internal note added", "success");
            } else {
              toast("Couldn't add note — please try again", "danger");
            }
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
