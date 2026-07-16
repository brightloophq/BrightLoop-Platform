"use client";

import { useState } from "react";
import { FACETS } from "@brightloop/schema";
import { Alert, Button, Card, Input } from "@brightloop/ui";
import { createClientOrg } from "../delivery-actions";
import styles from "../cms.module.css";

export function NewClientForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await createClientOrg(formData);
    setPending(false);
    if (result.ok) setOpen(false);
    else setError(result.error ?? "Failed");
  }

  if (!open) {
    return (
      <Button variant="primary" size="md" onClick={() => setOpen(true)}>
        New client
      </Button>
    );
  }

  return (
    <Card>
      <form action={onSubmit} className={styles.form} noValidate>
        {error ? (
          <div className={styles.formFull}>
            <Alert tone="danger" title="Couldn't create the client">
              {error}
            </Alert>
          </div>
        ) : null}
        <Input label="Company" name="company" required />
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
        <Input label="Plan" name="plan" optional placeholder="Launch, Growth Partner, …" />
        <div className={`${styles.formFull} ${styles.hint}`}>
          Created as a <strong>prospect</strong>. Lifecycle advances through guarded transitions —
          becoming an active client requires a signed contract and a successful payment.
        </div>
        <div className={styles.formActions}>
          <Button type="submit" variant="primary" size="md" loading={pending}>
            {pending ? "Creating…" : "Create client"}
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
