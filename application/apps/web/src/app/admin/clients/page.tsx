import Link from "next/link";
import type { Metadata } from "next";
import { toneFor } from "@brightloop/schema";
import { Alert, Badge, Card, EmptyState } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import { moveClientLifecycle } from "../delivery-actions";
import { StageControl } from "../StageControl";
import { NewClientForm } from "./NewClientForm";
import styles from "../cms.module.css";
import shell from "../admin.module.css";

export const metadata: Metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

/**
 * Clients (handoff §08). Aggregate root for all portal data.
 *
 * Finance fields (MRR) are shown only to finance-capable roles — but this list
 * is already internal-only via RLS. Lifecycle moves through the guarded service.
 */
export default async function ClientsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  const clients = data ?? [];
  const active = clients.filter((c) => c.lifecycle === "client_active").length;

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>Clients</h1>
      </div>

      <div className={shell.content}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Client organisations</h2>
            <p className={styles.lede}>
              {clients.length} total · {active} active. Each client is the root of its own portal
              data; RLS scopes everything a client user sees to their own org.
            </p>
          </div>
          <NewClientForm />
        </div>

        {error ? (
          <div className={styles.notice}>
            <Alert tone="danger" title="Couldn't load clients">
              {error.message}
            </Alert>
          </div>
        ) : null}

        {clients.length === 0 ? (
          <EmptyState
            icon="users"
            title="No clients yet"
            body="Create a client organisation, or convert a won lead."
          />
        ) : (
          <div className={styles.rows}>
            {clients.map((c) => (
              <Card key={c.id} className={styles.row}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <Link href={`/admin/clients/${c.id}`} className={styles.rowName} style={{ textDecoration: "none" }}>
                      {c.company}
                    </Link>
                    <Badge tone={toneFor(c.lifecycle)} dot>
                      {c.lifecycle.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className={styles.rowMeta}>
                    {c.industry || "—"}
                    {c.plan ? ` · ${c.plan}` : ""} · {c.seats} {c.seats === 1 ? "seat" : "seats"}
                  </p>
                </div>

                <StageControl
                  machine="clientLifecycle"
                  entityId={c.id}
                  current={c.lifecycle}
                  action={moveClientLifecycle}
                />
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
