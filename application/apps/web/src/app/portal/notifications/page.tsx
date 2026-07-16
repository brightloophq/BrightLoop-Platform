import type { Metadata } from "next";
import { EmptyState } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import { NotificationRow } from "./NotificationRow";
import styles from "../../admin/cms.module.css";
import shell from "../../admin/admin.module.css";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

/**
 * Notifications (handoff §07). RLS scopes these to the signed-in user by their
 * auth_user_id, so a user sees only their own — not even other members of their
 * own org.
 */
export default async function PortalNotificationsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false });

  const notifications = data ?? [];
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>Notifications</h1>
      </div>

      <div className={shell.content}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Notifications</h2>
            <p className={styles.lede}>{unread > 0 ? `${unread} unread.` : "You're all caught up."}</p>
          </div>
        </div>

        {notifications.length === 0 ? (
          <EmptyState icon="heart" title="You're all caught up" body="Notifications about your project appear here." />
        ) : (
          <div className={styles.rows}>
            {notifications.map((n) => (
              <NotificationRow
                key={n.id}
                id={n.id}
                title={n.title}
                body={n.body}
                read={n.read}
                entityRef={n.entity_ref}
                kind={n.kind}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
