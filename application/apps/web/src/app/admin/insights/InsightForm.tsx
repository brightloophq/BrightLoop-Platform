"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, FormSection, Input, Textarea } from "@brightloop/ui";
import { createInsightAction } from "./insights-actions";
import styles from "./insights.module.css";

export interface SignalOption {
  id: string;
  title: string;
  status: string;
  orgName: string;
}

const EVIDENCE_KINDS = [
  { value: "observation", label: "Observation" },
  { value: "metric", label: "Metric" },
  { value: "document", label: "Document" },
  { value: "conversation", label: "Conversation" },
  { value: "external", label: "External" },
] as const;

/**
 * Create Insight form. An insight interprets a Signal, so the first choice is the
 * signal it derives from — the tenant is taken from that signal server-side.
 * Client-validated for responsiveness, but the server action re-validates against
 * the shared schema and owns persistence. Input is preserved on failure, submission
 * is guarded against double-submit, and errors surface inline + in a focused summary.
 */
export function InsightForm({ signals }: { signals: SignalOption[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  // Group signal options by organization for a scannable <optgroup> select.
  const grouped = useMemo(() => {
    const map = new Map<string, SignalOption[]>();
    for (const s of signals) {
      const list = map.get(s.orgName) ?? [];
      list.push(s);
      map.set(s.orgName, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [signals]);

  async function onSubmit(formData: FormData) {
    if (pending) return; // duplicate-submit guard
    setPending(true);
    setError(undefined);
    setFieldErrors({});

    const result = await createInsightAction(formData);
    if (result.ok && result.id) {
      router.push(`/admin/insights/${result.id}?created=1`);
      return;
    }
    setPending(false);
    setError(result.error ?? "Couldn't create the insight.");
    setFieldErrors(result.fieldErrors ?? {});
  }

  return (
    <form action={onSubmit} className={styles.form} noValidate>
      {error ? (
        <div ref={errorRef} tabIndex={-1} className={styles.formTop}>
          <Alert tone="danger" title="Couldn't create the insight">
            {error}
          </Alert>
        </div>
      ) : null}

      <FormSection title="Interpretation" description="What a signal means, and the signal it derives from.">
        <label className={styles.field}>
          <span className={styles.label}>
            Signal <span className={styles.req}>*</span>
          </span>
          <select name="signalId" className={styles.select} required defaultValue="" aria-describedby="signalId-hint">
            <option value="" disabled>
              Select the signal this interprets…
            </option>
            {grouped.map(([org, opts]) => (
              <optgroup key={org} label={org}>
                {opts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {fieldErrors["signalId"] ? (
            <span role="alert" className={styles.fieldError}>
              {fieldErrors["signalId"]}
            </span>
          ) : (
            <span id="signalId-hint" className={styles.hint}>
              The insight inherits this signal's organization.
            </span>
          )}
        </label>

        <div className={styles.fieldWide}>
          <Input
            label="Summary"
            name="summary"
            required
            maxLength={200}
            error={fieldErrors["summary"]}
            hint="The interpretation in one line — e.g. “Delivery cost is structural, not seasonal”."
            placeholder="What does the signal mean?"
          />
        </div>

        <div className={styles.fieldWide}>
          <Textarea
            label="Detail"
            name="detail"
            optional
            maxLength={4000}
            error={fieldErrors["detail"]}
            hint="The reasoning that supports this interpretation."
          />
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Confidence</span>
          <span className={styles.confidenceInputWrap}>
            <input
              type="number"
              name="confidence"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              className={styles.confidenceInput}
              placeholder="—"
              aria-describedby="confidence-hint"
            />
            <span className={styles.confidenceUnit} aria-hidden="true">
              %
            </span>
          </span>
          {fieldErrors["confidence"] ? (
            <span role="alert" className={styles.fieldError}>
              {fieldErrors["confidence"]}
            </span>
          ) : (
            <span id="confidence-hint" className={styles.hint}>
              Optional. How sure you are, 0–100%. Leave blank if unrated.
            </span>
          )}
        </label>
      </FormSection>

      <FormSection
        title="Supporting evidence"
        description="Optional — attach one reference now; more can be added as the insight is worked."
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
        <Button type="button" variant="ghost" onClick={() => router.push("/admin/insights")} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          {pending ? "Creating…" : "Create insight"}
        </Button>
      </div>
    </form>
  );
}
