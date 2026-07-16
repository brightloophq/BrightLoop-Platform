"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Badge, Card, Icon } from "@brightloop/ui";
import { markNotificationRead } from "../portal-actions";
import styles from "../../admin/cms.module.css";

interface Props {
  id: string;
  title: string;
  body: string | null;
  read: boolean;
  entityRef: string | null;
  kind: string;
}

/** A notification row with mark-read. entityRef deep-links to the source (§07). */
export function NotificationRow({ id, title, body, read, entityRef }: Props) {
  const [pending, start] = useTransition();

  const markRead = () => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => void markNotificationRead(fd));
  };

  const content = (
    <div className={styles.rowBody}>
      <div className={styles.rowTop}>
        {!read ? <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--bl-cyan)", flex: "none" }} aria-label="unread" /> : null}
        <span className={styles.rowName}>{title}</span>
        {!read ? <Badge tone="cyan">new</Badge> : null}
      </div>
      {body ? <p className={styles.rowMeta} style={{ marginTop: "var(--space-1)" }}>{body}</p> : null}
    </div>
  );

  return (
    <Card className={styles.row}>
      {entityRef ? (
        <Link href={entityRef} className={styles.rowName} style={{ textDecoration: "none", flex: 1 }} onClick={markRead}>
          {content}
        </Link>
      ) : (
        content
      )}
      {!read ? (
        <button
          type="button"
          onClick={markRead}
          disabled={pending}
          className={styles.toggle}
          aria-label="Mark read"
        >
          <Icon name="check" size={13} />
          {pending ? "…" : "Mark read"}
        </button>
      ) : null}
    </Card>
  );
}
