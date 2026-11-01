"use client";

import { useState } from "react";
import { RATING_CATEGORIES, type Testimonial } from "@brightloop/schema";
import { Alert, Button, Card, Input, Textarea } from "@brightloop/ui";
import { saveTestimonial } from "../reputation-actions";
import styles from "../cms.module.css";

/**
 * Add OR edit a testimonial (handoff §08 Reviews · §09.2 validation).
 *
 * INTEGRITY: this records what a real client SAID. It cannot author one, and it
 * cannot publish one — a NEW review is created as `draft` and reaches the public
 * site only through a separate, deliberate moderation step.
 *
 * `saveTestimonial` has always supported updating (it keys off a hidden `id`),
 * but nothing rendered that path, so a typo or a rebrand in a published quote
 * could only be fixed in the Supabase dashboard. Passing `testimonial` turns
 * this into the edit form for that row.
 *
 * EDITING DOES NOT RE-MODERATE. The action's update writes only the content
 * columns — publish status, pin and feature-on-home are left exactly as they
 * were, so correcting a live review does not silently pull it off the site.
 *
 * Every field must be PREFILLED when editing, and that is not cosmetic: the
 * update writes the whole content row, so a field left blank in the form would
 * blank the column. The labels below are the complete set the action reads.
 */
export function TestimonialForm({
  projectSlugs,
  testimonial,
}: {
  projectSlugs: string[];
  /** Present → edit that row. Absent → create a new draft. */
  testimonial?: Testimonial;
}) {
  const editing = testimonial !== undefined;
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ error?: string; ok?: boolean }>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    const result = await saveTestimonial(formData);
    setPending(false);
    setState(result.ok ? { ok: true } : { error: result.error });
    if (result.ok) setOpen(false);
  }

  if (!open) {
    return (
      <>
        {state.ok ? (
          editing ? (
            <Alert tone="success" title="Changes saved">
              Its publish status is unchanged. The public site picks this up within a few minutes.
            </Alert>
          ) : (
            <Alert tone="success" title="Saved as draft">
              It is not public yet. Set its status to Public or Featured below when you&apos;re ready.
            </Alert>
          )
        ) : null}
        <Button
          variant={editing ? "secondary" : "primary"}
          size={editing ? "sm" : "md"}
          onClick={() => setOpen(true)}
        >
          {editing ? "Edit" : "Add a testimonial"}
        </Button>
      </>
    );
  }

  return (
    <Card>
      <form action={onSubmit} className={styles.form} noValidate>
        {/* The whole edit path hinges on this: the action updates when it finds an id. */}
        {editing ? <input type="hidden" name="id" value={testimonial.id} /> : null}

        <p className={`${styles.formFull} ${styles.hint}`}>
          {editing
            ? "Correct what was recorded — a typo, a job title, a company name after a rebrand. If these are a real client's own words, changing them changes what they are on record as saying, so keep it to corrections they would recognise as accurate."
            : "Record what the client actually said, in their words, with their permission. Saved as a draft — nothing goes public until you publish it."}
        </p>

        {state.error ? (
          <div className={styles.formFull}>
            <Alert tone="danger" title="Couldn't save">
              {state.error}
            </Alert>
          </div>
        ) : null}

        <Input label="Author" name="author" required placeholder="Maya Thompson" defaultValue={testimonial?.author} />
        <Input label="Company" name="company" required placeholder="Verdant Fields Co." defaultValue={testimonial?.company} />
        <Input label="Role" name="role" optional placeholder="Founder" defaultValue={testimonial?.role} />
        <Input label="Country" name="country" optional placeholder="Jamaica" defaultValue={testimonial?.country} />
        <Input label="Date" name="date" type="date" optional defaultValue={testimonial?.date ?? ""} />

        <div>
          <label className={styles.hint} htmlFor="projectSlug">
            Linked project (optional)
          </label>
          <select
            id="projectSlug"
            name="projectSlug"
            className={styles.select}
            style={{ width: "100%", height: 44 }}
            defaultValue={testimonial?.projectSlug ?? ""}
          >
            <option value="">— none —</option>
            {projectSlugs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formFull}>
          <Textarea
            label="Quote"
            name="quote"
            required
            hint="Their words, not yours. Quote it as they said it."
            maxLength={2000}
            defaultValue={testimonial?.quote}
          />
        </div>

        <div className={styles.ratings}>
          <Input
            label="Overall (1–5)"
            name="overall"
            type="number"
            min={1}
            max={5}
            defaultValue={testimonial?.overall ?? 5}
            required
          />
          {RATING_CATEGORIES.map((c) => (
            <Input
              key={c}
              label={`${c[0]!.toUpperCase()}${c.slice(1)} (1–5)`}
              name={`categories.${c}`}
              type="number"
              min={1}
              max={5}
              defaultValue={testimonial?.categories[c] ?? 5}
              required
            />
          ))}
        </div>

        <div className={styles.formActions}>
          <Button type="submit" variant="primary" size="md" loading={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Save as draft"}
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
