import Link from "next/link";
import type { Metadata } from "next";
import { PUBLISH } from "@brightloop/schema";
import { aggregate } from "@brightloop/domain";
import { toTestimonial } from "@brightloop/data";
import { Alert, Card, Stat } from "@brightloop/ui";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import styles from "./cms.module.css";
import shell from "./admin.module.css";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

/**
 * Executive overview (handoff §08).
 *
 * INTEGRITY (§08): "all figures computed from real data; demo numbers in
 * admin-data.js are placeholder."
 *
 * So this shows ONLY what can be counted from the live database right now:
 * reputation state. MRR, pipeline value, projects in flight and overdue invoices
 * are deliberately absent rather than rendered as zeros or sample figures — a
 * dashboard that invents numbers is worse than one that admits it has none.
 * Each lands with the module that owns its data.
 */
export default async function AdminDashboardPage() {
  const actor = await getActor();
  const supabase = await createClient();

  const [{ data: pRows, error: pErr }, { data: tRows }] = await Promise.all([
    supabase.from("portfolio_projects").select("id, publish"),
    supabase.from("testimonials").select("*"),
  ]);

  const projects = pRows ?? [];
  const testimonials = (tRows ?? []).map(toTestimonial);

  const livePr = projects.filter((p) => PUBLISH[p.publish as keyof typeof PUBLISH]?.public).length;
  const draftPr = projects.length - livePr;
  const rating = aggregate(testimonials);

  const denied = pErr?.message?.toLowerCase().includes("permission");

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>Overview</h1>
      </div>

      <div className={shell.content}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Signed in as {actor?.role}</h2>
            <p className={styles.lede}>
              Everything below is counted from the live database. Figures the platform cannot yet
              compute honestly — MRR, pipeline, projects in flight — are left out rather than shown
              as zeros.
            </p>
          </div>
        </div>

        {denied ? (
          <div className={styles.notice}>
            <Alert tone="danger" title="The database is refusing to answer">
              Your session has no role claim, so every RLS policy denies. Register the custom access
              token hook in Supabase (Authentication → Hooks → Custom Access Token →
              <code> public.custom_access_token_hook</code>), then sign out and back in.
            </Alert>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "var(--space-4)",
            marginBottom: "var(--space-6)",
          }}
        >
          <Card>
            <Stat value={livePr} label="Case studies live" accent />
          </Card>
          <Card>
            <Stat value={draftPr} label="Case studies unpublished" />
          </Card>
          <Card>
            <Stat value={rating.count} label="Reviews published" />
          </Card>
          <Card>
            <Stat
              value={rating.count > 0 ? rating.overall.toFixed(1) : "—"}
              label="Aggregate rating"
            />
          </Card>
        </div>

        <Alert tone="info" title="Where to start">
          Add your testimonials in <Link href="/admin/reviews">Reviews</Link>. They save as drafts —
          nothing reaches the public site until you set it to Public or Featured.
        </Alert>
      </div>
    </>
  );
}
