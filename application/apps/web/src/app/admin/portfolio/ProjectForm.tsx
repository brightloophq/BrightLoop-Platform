"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FACETS, type PortfolioProject } from "@brightloop/schema";
import { Alert, Button, Card, Input, Textarea } from "@brightloop/ui";
import { slugify } from "@/lib/slug";
import { saveProject } from "../reputation-actions";
import styles from "../cms.module.css";

interface Props {
  /** Existing project when editing; absent when creating. */
  project?: PortfolioProject;
  /** Published+draft testimonials available to link. */
  testimonials: { id: string; author: string; company: string }[];
}

/**
 * Create/edit a portfolio project (handoff §08 · validation §09.2).
 *
 * Deliberately NOT here:
 *   * publish status — that lives on the list row, so publishing is always a
 *     separate act from editing;
 *   * result metrics — they have their own guarded action, so a case study can
 *     never acquire business results as a side-effect of a content edit.
 */
export function ProjectForm({ project, testimonials }: Props) {
  const router = useRouter();
  const editing = Boolean(project);

  const [name, setName] = useState(project?.name ?? "");
  const [slug, setSlug] = useState(project?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(project));
  const [livePermitted, setLivePermitted] = useState(project?.permissionLivePreview ?? false);
  const [state, setState] = useState<{ error?: string }>({});
  const [pending, setPending] = useState(false);

  // Auto-suggest the slug from the name until the user edits it themselves.
  const onName = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  async function onSubmit(formData: FormData) {
    setPending(true);
    const result = await saveProject(formData);
    setPending(false);
    if (result.ok) {
      router.push("/admin/portfolio");
      router.refresh();
    } else {
      setState({ error: result.error });
    }
  }

  const sel = (label: string, field: string, options: readonly (string | number)[], value?: string) => (
    <div>
      <label className={styles.hint} htmlFor={field}>
        {label}
      </label>
      <select
        id={field}
        name={field}
        defaultValue={value ?? ""}
        className={styles.select}
        style={{ width: "100%", height: 44 }}
      >
        <option value="">— select —</option>
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );

  const checks = (label: string, field: string, options: readonly string[], selected: string[]) => (
    <div className={styles.formFull}>
      <span className={styles.hint}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
        {options.map((o) => (
          <label key={o} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--fs-sm)", color: "var(--text-secondary)" }}>
            <input type="checkbox" name={field} value={o} defaultChecked={selected.includes(o)} />
            {o}
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <Card>
      <form action={onSubmit} className={styles.form} noValidate>
        {project ? <input type="hidden" name="id" value={project.id} /> : null}

        {state.error ? (
          <div className={styles.formFull}>
            <Alert tone="danger" title="Couldn't save">
              {state.error}
            </Alert>
          </div>
        ) : null}

        {!editing ? (
          <p className={`${styles.formFull} ${styles.hint}`}>
            Saved as a <strong>draft</strong>. It won&apos;t appear on the site, in the sitemap, or
            in structured data until you set its status to Public or Featured on the list.
          </p>
        ) : null}

        <Input label="Project name" name="name" required value={name} onChange={(e) => onName(e.target.value)} />
        <Input
          label="Slug"
          name="slug"
          required
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          hint="Used in the URL: /portfolio/your-slug. Must be unique."
        />

        <Input label="Client" name="client" required defaultValue={project?.client} />
        {sel("Industry", "industry", FACETS.industry, project?.industry)}
        {sel("Business size", "size", FACETS.size, project?.size)}
        {sel("Country", "country", FACETS.country, project?.country)}
        {sel("Year", "year", FACETS.year, project ? String(project.year) : undefined)}
        {sel("Budget range", "budget", FACETS.budget, project?.budget)}

        <Input label="Platform" name="platform" defaultValue={project?.platform} placeholder="Webflow" />
        <Input label="Timeline" name="timeline" defaultValue={project?.timeline} placeholder="7 weeks" />
        <Input
          label="Deliverables"
          name="deliverablesCount"
          type="number"
          min={0}
          defaultValue={project?.deliverablesCount ?? 0}
        />
        <Input label="Project status" name="projectStatus" defaultValue={project?.projectStatus} placeholder="Live" />
        <Input
          label="Completed date"
          name="completedDate"
          type="date"
          optional
          defaultValue={project?.completedDate || undefined}
        />

        {checks("Services", "services", FACETS.service, project?.services ?? [])}
        {checks("Technology", "tech", FACETS.tech, project?.tech ?? [])}

        <div className={styles.formFull}>
          <Input
            label="Tags"
            name="tags"
            optional
            defaultValue={project?.tags.join(", ")}
            hint="Comma-separated. Used by search and the 'you may also like' scoring."
          />
        </div>

        <div className={styles.formFull}>
          <Textarea label="Summary" name="summary" defaultValue={project?.summary} maxLength={400} />
        </div>
        <div className={styles.formFull}>
          <Textarea label="The challenge" name="challenge" defaultValue={project?.challenge} maxLength={2000} />
        </div>
        <div className={styles.formFull}>
          <Textarea label="Our approach" name="approach" defaultValue={project?.approach} maxLength={2000} />
        </div>

        {/* Live preview gate — permission AND a real URL, per handoff §05. */}
        <div className={styles.formFull} style={{ padding: "var(--space-4)", background: "var(--surface-inset)", border: "var(--border-hairline)", borderRadius: "var(--radius-md)" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", color: "var(--text-primary)", fontSize: "var(--fs-sm)", fontWeight: 600 }}>
            <input
              type="checkbox"
              name="permissionLivePreview"
              defaultChecked={project?.permissionLivePreview}
              onChange={(e) => setLivePermitted(e.target.checked)}
            />
            The client has agreed we may link to their live site
          </label>
          <p className={styles.hint} style={{ marginTop: "var(--space-2)" }}>
            Without this, the case study shows &ldquo;live preview not shared&rdquo; instead of a
            link — even if a URL is present.
          </p>
          {livePermitted ? (
            <div style={{ marginTop: "var(--space-3)" }}>
              <Input label="Live URL" name="liveUrl" type="url" defaultValue={project?.liveUrl} placeholder="https://example.com" />
            </div>
          ) : null}
        </div>

        <div>
          <label className={styles.hint} htmlFor="testimonialId">
            Linked testimonial (optional)
          </label>
          <select
            id="testimonialId"
            name="testimonialId"
            defaultValue={project?.testimonialId ?? ""}
            className={styles.select}
            style={{ width: "100%", height: 44 }}
          >
            <option value="">— none —</option>
            {testimonials.map((t) => (
              <option key={t.id} value={t.id}>
                {t.author} · {t.company}
              </option>
            ))}
          </select>
          <p className={styles.hint} style={{ marginTop: "var(--space-2)" }}>
            Only shows publicly if the review itself is published.
          </p>
        </div>

        <Input label="SEO title" name="seoTitle" optional defaultValue={project?.seo.title} />
        <div className={styles.formFull}>
          <Textarea label="SEO description" name="seoDescription" optional defaultValue={project?.seo.description} maxLength={300} />
        </div>

        <div className={styles.formActions}>
          <Button type="submit" variant="primary" size="md" loading={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Create as draft"}
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={() => router.push("/admin/portfolio")}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
