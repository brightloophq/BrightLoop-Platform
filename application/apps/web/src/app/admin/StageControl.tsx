"use client";

import { useState, useTransition } from "react";
import { nextStates, toneFor, type MachineName } from "@brightloop/schema";
import { Badge, Icon } from "@brightloop/ui";
import styles from "./cms.module.css";

type MoveAction = (formData: FormData) => Promise<{ ok: boolean; error?: string }>;

interface Props {
  machine: MachineName;
  entityId: string;
  current: string;
  action: MoveAction;
  /** Machine states that need a reason before moving (e.g. paused/delayed). */
  reasonFor?: readonly string[];
  /** States that also take a revised date. */
  dateFor?: readonly string[];
  /** Extra hidden fields to submit (e.g. projectId for revalidation). */
  extraFields?: Record<string, string>;
  disabled?: boolean;
}

/**
 * StageControl — moves an entity to a legal next state.
 *
 * The dropdown is populated by `nextStates(machine, current)` from the domain
 * guard, so the UI can only ever OFFER a legal transition (layer 1 of 3). The
 * server action re-checks with can() and audits (layer 2); the DB trigger is the
 * backstop (layer 3). An illegal move is impossible to even select here, and
 * still rejected if one were forged.
 */
export function StageControl({
  machine,
  entityId,
  current,
  action,
  reasonFor = [],
  dateFor = [],
  extraFields = {},
  disabled = false,
}: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<string>("");

  const options = nextStates(machine, current);
  const needsReason = target !== "" && reasonFor.includes(target);
  const needsDate = target !== "" && dateFor.includes(target);

  const submit = (formData: FormData) => {
    setError(null);
    start(async () => {
      const result = await action(formData);
      if (!result.ok) setError(result.error ?? "Failed");
      else setTarget("");
    });
  };

  return (
    <div className={styles.controls}>
      <Badge tone={toneFor(current)} dot>
        {current.replace(/_/g, " ")}
      </Badge>

      {options.length === 0 ? (
        <span className={styles.rowMeta}>terminal</span>
      ) : (
        <form action={submit} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <input type="hidden" name="id" value={entityId} />
          {Object.entries(extraFields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <select
            name="to"
            className={styles.select}
            value={target}
            disabled={disabled || pending}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Move to…</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>

          {needsReason ? (
            <input
              name="reason"
              className={styles.select}
              placeholder="Reason (required)"
              style={{ minWidth: 180 }}
            />
          ) : null}
          {needsDate ? <input name="targetDate" type="date" className={styles.select} /> : null}

          {target ? (
            <button
              type="submit"
              className={[styles.toggle, styles.toggleOn].join(" ")}
              disabled={pending}
              aria-label={`Move to ${target}`}
            >
              <Icon name="arrow-right" size={13} />
              {pending ? "…" : "Go"}
            </button>
          ) : null}
        </form>
      )}

      {error ? (
        <span className={styles.rowMeta} style={{ color: "var(--danger)" }} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
