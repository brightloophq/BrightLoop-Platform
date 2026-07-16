import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { toPortfolioProject } from "@brightloop/data";
import { Icon } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm } from "../ProjectForm";
import { MetricsPanel } from "../MetricsPanel";
import styles from "../../cms.module.css";
import shell from "../../admin.module.css";

export const metadata: Metadata = { title: "Edit case study" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Edit a case study.
 *
 * Content and result metrics are edited SEPARATELY — see MetricsPanel. That
 * separation is deliberate: a case study must not be able to acquire business
 * results as a side-effect of a copy edit.
 */
export default async function EditProjectPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: row }, { data: ts }] = await Promise.all([
    supabase.from("portfolio_projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("testimonials").select("id, author, company"),
  ]);

  if (!row) notFound();
  const project = toPortfolioProject(row);

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>{project.name}</h1>
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
            <h2 className={styles.title}>Edit case study</h2>
            <p className={styles.lede}>
              Publish status lives on the portfolio list, not here — so publishing stays a separate,
              deliberate act from editing.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          <ProjectForm project={project} testimonials={ts ?? []} />
          <MetricsPanel project={project} />
        </div>
      </div>
    </>
  );
}
