import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm } from "../ProjectForm";
import styles from "../../cms.module.css";
import shell from "../../admin.module.css";

export const metadata: Metadata = { title: "New case study" };
export const dynamic = "force-dynamic";

/** Create a case study (handoff §08 — "New project" → draft). */
export default async function NewProjectPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("testimonials").select("id, author, company");

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>New case study</h1>
      </div>

      <div className={shell.content}>
        <Link
          href="/admin/portfolio"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-1)",
            color: "var(--text-muted)",
            textDecoration: "none",
            fontSize: "var(--fs-sm)",
            marginBottom: "var(--space-5)",
          }}
        >
          <Icon name="arrow-left" size={14} />
          Back to portfolio
        </Link>

        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Add a case study</h2>
            <p className={styles.lede}>
              Only project facts here — timeline, deliverables, platform, what you did. Business
              results are set separately, and only where the client has approved them.
            </p>
          </div>
        </div>

        <ProjectForm testimonials={data ?? []} />
      </div>
    </>
  );
}
