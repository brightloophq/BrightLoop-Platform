"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, FormSection, Input, Textarea } from "@brightloop/ui";
import { createSignalAction } from "./signals-actions";
import styles from "./signals.module.css";

interface Org {
  id: string;
  name: string;
}

const EVIDENCE_KINDS = [
  { value: "observation", label: "Observation" },
  { value: "metric", label: "Metric" },
  { value: "document", label: "Document" },
  { value: "conversation", label: "Conversation" },
  { value: "external", label: "External" },
] as const;

/**
 * Create Signal form. Client-validated for responsiveness, but the server action
 * re-validates against the shared schema and owns persistence. Input is preserved
 * on failure (uncontrolled inputs keep their value), submission is guarded against
 * double-submit, and errors surface both inline and in a focus-managed summary.
 */
export function SignalForm({ orgs }: { orgs: Org[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function onSubmit(formData: FormData) {
    if (pending) return; // duplicate-submit guard
    setPending(true);
    setError(undefined);
    setFieldErrors({});

    const result = await createSignalAction(formData);
    if (result.ok && result.id) {
      // Keep the button disabled through navigation; success is confirmed on the
      // detail page (?created=1).
      router.push(`/admin/signals/${result.id}?created=1`);
      return;
    }
    setPending(false);
    setError(result.error ?? "Couldn't create the signal.");
    setFieldErrors(result.fieldErrors ?? {});
  }

  return (
    <form action={onSubmit} className={styles.form} noValidate>
      {error ? (
        <div ref={errorRef} tabIndex={-1} className={styles.formTop}>
          <Alert tone="danger" title="Couldn't create the signal">
            {error}
          </Alert>
        </div>
      ) : null}

      <FormSection title="Signal" description="What was detected, and for which organization.">
        <label className={styles.field}>
          <span className={styles.label}>
            Organization <span className={styles.req}>*</span>
          </span>
          <select name="clientId" className={styles.select} required defaultValue="" aria-describedby="clientId-hint">
            <option value="" disabled>
              Select an organization…
            </option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {fieldErrors["clientId"] ? (
            <span role="alert" className={styles.fieldError}>
              {fieldErrors["clientId"]}
            </span>
          ) : (
            <span id="clientId-hint" className={styles.hint}>
              The client this signal is about.
            </span>
          )}
        </label>

        <div className={styles.fieldWide}>
          <Input
            label="Title"
            name="title"
            required
            maxLength={200}
            error={fieldErrors["title"]}
            hint="A short, specific summary — e.g. “Delivery cycle time up 20%”."
            placeholder="What changed?"
          />
        </div>

        <div className={styles.fieldWide}>
          <Input
            label="Source"
            name="sourceRef"
            optional
            maxLength={300}
            error={fieldErrors["sourceRef"]}
            hint="Where it came from (a metric key, a report, monitoring)."
            placeholder="metric:cycle_time"
          />
        </div>

        <div className={styles.fieldWide}>
          <Textarea
            label="Description"
            name="detail"
            optional
            maxLength={4000}
            error={fieldErrors["detail"]}
            hint="Context that helps someone triage this signal."
          />
        </div>
      </FormSection>

      <FormSection
        title="Supporting evidence"
        description="Optional — attach one reference now; more can be added as the signal is worked."
      >
        <label className={styles.field}>
          <span className={styles.label}>Kind</span>
          <select name="evidenceKind" className={styles.select} defaultValue="observation">
            {EVIDENCE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.fieldWide}>
          <Input label="Reference" name="evidenceRef" optional placeholder="A metric key, document id, or link" />
        </div>
        <div className={styles.fieldWide}>
          <Input label="Label" name="evidenceLabel" optional placeholder="A human-readable name for the evidence" />
        </div>
      </FormSection>

      <div className={styles.formActions}>
        <Button type="button" variant="ghost" onClick={() => router.push("/admin/signals")} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          {pending ? "Creating…" : "Create signal"}
        </Button>
      </div>
    </form>
  );
}
