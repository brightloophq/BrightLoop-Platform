"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { METRIC_DEFS, type PortfolioProject } from "@brightloop/schema";
import { Alert, Button, Card, Input } from "@brightloop/ui";
import { setProjectMetrics } from "../reputation-actions";
import styles from "../cms.module.css";

const NUMERIC = new Set(["leadsGenerated", "conversionLift", "revenueGrowth"]);

/**
 * Result metrics (handoff §10.3 — the integrity rule made operable).
 *
 * "Admins must not be able to publish a fabricated metric — the field is inert
 * unless disclosed + supplied."
 *
 * So the inputs literally do not exist until disclosure is ticked, and ticking it
 * is an explicit statement that the CLIENT approved these numbers. Turning it off
 * WIPES the values rather than hiding them: leaving numbers in an undisclosed row
 * is how a later toggle republishes figures nobody re-approved.
 *
 * Undisclosed is not a gap to fill. It is the honest default, and the public page
 * has a real state for it — "results kept private at the client's request".
 */
export function MetricsPanel({ project }: { project: PortfolioProject }) {
  const router = useRouter();
  const [disclosed, setDisclosed] = useState(project.metrics.disclosed);
  const [state, setState] = useState<{ error?: string; ok?: boolean }>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    formData.set("disclosed", String(disclosed));
    const result = await setProjectMetrics(formData);
    setPending(false);
    setState(result.ok ? { ok: true } : { error: result.error });
    if (result.ok) router.refresh();
  }

  const current = project.metrics as unknown as Record<string, unknown>;

  return (
    <Card>
      <form action={onSubmit} className={styles.form} noValidate>
        <input type="hidden" name="id" value={project.id} />
        <input type="hidden" name="slug" value={project.slug} />

        <div className={styles.formFull}>
          <h3 style={{ fontSize: "var(--fs-h4)", marginBottom: "var(--space-2)" }}>Results</h3>
          <p className={styles.hint}>
            Only tick this if the client has explicitly approved publishing these numbers. Left
            untouched, the case study shows &ldquo;results kept private at the client&rsquo;s
            request&rdquo; — which is a perfectly good answer and the default for every project.
          </p>
        </div>

        {state.error ? (
          <div className={styles.formFull}>
            <Alert tone="danger" title="Couldn't save">
              {state.error}
            </Alert>
          </div>
        ) : null}
        {state.ok ? (
          <div className={styles.formFull}>
            <Alert tone="success">Saved.</Alert>
          </div>
        ) : null}

        <div
          className={styles.formFull}
          style={{
            padding: "var(--space-4)",
            background: "var(--surface-inset)",
            border: "var(--border-hairline)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
              color: "var(--text-primary)",
              fontSize: "var(--fs-sm)",
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              checked={disclosed}
              onChange={(e) => setDisclosed(e.target.checked)}
            />
            The client has approved publishing these results
          </label>

          {disclosed ? (
            <>
              <p className={styles.hint} style={{ marginTop: "var(--space-3)" }}>
                Leave any field blank to omit it. Blank is not zero — an omitted metric simply
                isn&apos;t shown.
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "var(--space-3)",
                  marginTop: "var(--space-3)",
                }}
              >
                {METRIC_DEFS.map((def) => (
                  <Input
                    key={def.key}
                    label={`${def.label}${def.unit ? ` (${def.unit})` : ""}`}
                    name={def.key}
                    optional
                    type={NUMERIC.has(def.key) ? "number" : "text"}
                    min={NUMERIC.has(def.key) ? 0 : undefined}
                    defaultValue={
                      typeof current[def.key] === "string" || typeof current[def.key] === "number"
                        ? String(current[def.key])
                        : ""
                    }
                    placeholder={NUMERIC.has(def.key) ? "e.g. 120" : "e.g. 6 hrs/week"}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className={styles.hint} style={{ marginTop: "var(--space-3)" }}>
              Results are private. Saving now <strong>erases any stored numbers</strong> rather than
              just hiding them — so nothing can be republished later by accident.
            </p>
          )}
        </div>

        <div className={styles.formActions}>
          <Button type="submit" variant="secondary" size="md" loading={pending}>
            {pending ? "Saving…" : "Save results"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
