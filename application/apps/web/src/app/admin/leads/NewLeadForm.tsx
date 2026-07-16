"use client";

import { useState } from "react";
import { FACETS } from "@brightloop/schema";
import { Alert, Button, Card, Input } from "@brightloop/ui";
import { createLead } from "../delivery-actions";
import styles from "../cms.module.css";

export function NewLeadForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await createLead(formData);
    setPending(false);
    if (result.ok) setOpen(false);
    else setError(result.error ?? "Failed");
  }

  if (!open) {
    return (
      <Button variant="primary" size="md" onClick={() => setOpen(true)}>
        New lead
      </Button>
    );
  }

  return (
    <Card>
      <form action={onSubmit} className={styles.form} noValidate>
        {error ? (
          <div className={styles.formFull}>
            <Alert tone="danger" title="Couldn't create the lead">
              {error}
            </Alert>
          </div>
        ) : null}
        <Input label="Contact name" name="name" required />
        <Input label="Email" name="email" type="email" required />
        <Input label="Company" name="company" optional />
        <div>
          <label className={styles.hint} htmlFor="industry">
            Industry
          </label>
          <select id="industry" name="industry" className={styles.select} style={{ width: "100%", height: 44 }}>
            <option value="">— select —</option>
            {FACETS.industry.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <Input label="Estimated value (USD)" name="value" type="number" min={0} defaultValue={0} />
        <Input label="Source" name="source" optional placeholder="Referral, website, …" />
        <div className={styles.formActions}>
          <Button type="submit" variant="primary" size="md" loading={pending}>
            {pending ? "Creating…" : "Create lead"}
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
