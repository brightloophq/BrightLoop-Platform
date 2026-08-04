"use client";

import { useState } from "react";
import { RATING_CATEGORIES } from "@brightloop/schema";
import { Alert, Button, Card, Input, Textarea } from "@brightloop/ui";
import { saveTestimonial } from "../reputation-actions";
import styles from "../cms.module.css";

/**
 * Add a testimonial (handoff §08 Reviews · §09.2 validation).
 *
 * INTEGRITY: this records what a real client SAID. It cannot author one, and it
 * cannot publish one — every review is created as `draft` and reaches the public
 * site only through a separate, deliberate moderation step.
 */
export function NewTestimonialForm({ projectSlugs }: { projectSlugs: string[] }) {
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
          <Alert tone="success" title="Saved as draft">
            It is not public yet. Set its status to Public or Featured below when you&apos;re ready.
          </Alert>
        ) : null}
        <Button variant="primary" size="md" onClick={() => setOpen(true)}>
          Add a testimonial
        </Button>
      </>
    );
  }

  return (
    <Card>
      <form action={onSubmit} className={styles.form} noValidate>
        <p className={`${styles.formFull} ${styles.hint}`}>
          Record what the client actually said, in their words, with their permission. Saved as a
          draft — nothing goes public until you publish it.
        </p>

        {state.error ? (
          <div className={styles.formFull}>
            <Alert tone="danger" title="Couldn't save">
              {state.error}
            </Alert>
          </div>
        ) : null}

        <Input label="Author" name="author" required placeholder="Maya Thompson" />
        <Input label="Company" name="company" required placeholder="Verdant Fields Co." />
        <Input label="Role" name="role" optional placeholder="Founder" />
        <Input label="Country" name="country" optional placeholder="Jamaica" />
        <Input label="Date" name="date" type="date" optional />

        <div>
          <label className={styles.hint} htmlFor="projectSlug">
            Linked project (optional)
          </label>
          <select id="projectSlug" name="projectSlug" className={styles.select} style={{ width: "100%", height: 44 }}>
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
          />
        </div>

        <div className={styles.ratings}>
          <Input label="Overall (1–5)" name="overall" type="number" min={1} max={5} defaultValue={5} required />
          {RATING_CATEGORIES.map((c) => (
            <Input
              key={c}
              label={`${c[0]!.toUpperCase()}${c.slice(1)} (1–5)`}
              name={`categories.${c}`}
              type="number"
              min={1}
              max={5}
              defaultValue={5}
              required
            />
          ))}
        </div>

        <div className={styles.formActions}>
          <Button type="submit" variant="primary" size="md" loading={pending}>
            {pending ? "Saving…" : "Save as draft"}
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
