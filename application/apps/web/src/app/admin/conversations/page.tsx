import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Card, EmptyState } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import styles from "../cms.module.css";
import shell from "../admin.module.css";

export const metadata: Metadata = { title: "Discovery conversations" };
export const dynamic = "force-dynamic";

const STATE_TONE: Record<string, "success" | "warning" | "neutral"> = {
  awaiting_admin: "warning",
  awaiting_client: "neutral",
  open: "neutral",
  closed: "success",
};

/**
 * Admin consulting inbox (handoff §12). Internal roles see every conversation
 * (RLS: `bl_is_internal()`); a client would see only their own here, but clients
 * never reach this admin surface.
 */
export default async function AdminConversationsPage() {
  const supabase = await createClient();

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, subject, state, last_message_at, client_id, clients(company)")
    .order("last_message_at", { ascending: false });

  const rows = conversations ?? [];

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>Discovery conversations</h1>
      </div>

      <div className={shell.content}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Consulting inbox</h2>
            <p className={styles.lede}>Live conversations with prospects and clients. Those awaiting a reply are flagged.</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="mail" title="No conversations yet" body="When a prospect starts a discovery chat, it lands here." />
        ) : (
          <div className={styles.rows}>
            {rows.map((c) => {
              const company = (c.clients as unknown as { company: string } | null)?.company ?? "Unknown client";
              return (
                <Card key={c.id} className={styles.row}>
                  <div className={styles.rowBody}>
                    <div className={styles.rowTop}>
                      <Link href={`/admin/conversations/${c.id}`} className={styles.rowName} style={{ textDecoration: "none" }}>
                        {company}
                      </Link>
                      <Badge tone={STATE_TONE[c.state] ?? "neutral"} dot>
                        {c.state.replace(/_/g, " ")}
                      </Badge>
                      <span className={styles.rowMeta}>
                        {new Date(c.last_message_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </div>
                    <p className={styles.rowMeta}>{c.subject}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
