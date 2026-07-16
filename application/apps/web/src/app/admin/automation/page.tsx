import type { Metadata } from "next";
import { toneFor } from "@brightloop/schema";
import { Alert, Badge, Card, EmptyState } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import styles from "../cms.module.css";
import shell from "../admin.module.css";

export const metadata: Metadata = { title: "Automation" };
export const dynamic = "force-dynamic";

/**
 * Automation monitoring (handoff §08 · §12).
 *
 * Displays the state of n8n workflows as the app knows it — driven by the
 * verified status callbacks at /api/webhooks/n8n. The app owns the display +
 * retry/mute; n8n owns orchestration. `failed` runs are surfaced with their
 * error so an admin can act.
 */
export default async function AutomationPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automations")
    .select("*")
    .order("last_run_at", { ascending: false, nullsFirst: false });

  const automations = data ?? [];
  const failing = automations.filter((a) => a.status === "failed");

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>Automation</h1>
      </div>

      <div className={shell.content}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Workflow monitoring</h2>
            <p className={styles.lede}>
              n8n runs the workflows; the platform shows their status from verified callbacks.
              {failing.length > 0 ? ` ${failing.length} needing attention.` : " All healthy."}
            </p>
          </div>
        </div>

        <div className={styles.notice}>
          <Alert tone="info" title="How this connects">
            The platform triggers workflows and receives signed status callbacks at{" "}
            <code>/api/webhooks/n8n</code>. Every callback&apos;s HMAC signature is verified before
            it&apos;s trusted, and every status change is guarded against the automation machine —
            n8n can notify, but it can&apos;t drive an illegal state.
          </Alert>
        </div>

        {error ? (
          <Card>
            <p className={styles.rowMeta}>Couldn&apos;t load automations: {error.message}</p>
          </Card>
        ) : automations.length === 0 ? (
          <EmptyState
            icon="workflow"
            title="No automations registered yet"
            body="Automations appear here once workflows (intake, dunning, review requests, approval nudges) are registered and start reporting status."
          />
        ) : (
          <div className={styles.rows}>
            {automations.map((a) => (
              <Card
                key={a.id}
                className={[styles.row, a.status === "failed" ? styles.rowLive : null].filter(Boolean).join(" ")}
                style={a.status === "failed" ? { borderColor: "rgba(239,68,68,0.3)" } : undefined}
              >
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowName}>{a.name}</span>
                    <span className={styles.rowMeta}>{a.provider}</span>
                    <Badge tone={toneFor(a.status)} dot>
                      {a.status}
                    </Badge>
                    <span className={styles.rowMeta}>{a.runs} runs</span>
                  </div>
                  {a.trigger ? <p className={styles.rowMeta}>Trigger: {a.trigger}</p> : null}
                  {a.status === "failed" && a.last_error ? (
                    <p className={styles.rowMeta} style={{ color: "var(--danger)", marginTop: "var(--space-2)" }}>
                      {a.last_error}
                    </p>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
