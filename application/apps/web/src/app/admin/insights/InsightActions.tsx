"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@brightloop/ui";
import type { InsightAction } from "@brightloop/domain";
import { transitionInsightAction } from "./insights-actions";
import styles from "./insights.module.css";

/**
 * The lifecycle actions for an insight (Endorse / Dismiss). Only actions currently
 * legal for its state are shown (the server re-validates and the DB guard
 * re-enforces). Both are terminal, so Dismiss requires an explicit confirmation.
 * Feedback is a toast + a server refresh so the status badge and history reflect
 * the change immediately.
 */
export function InsightActions({ id, actions }: { id: string; actions: InsightAction[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [busyTo, setBusyTo] = useState<string | null>(null);

  if (actions.length === 0) return null;

  function run(action: InsightAction) {
    if (
      action.confirm &&
      !window.confirm("Dismiss this insight? Dismissed insights are set aside and cannot be reopened.")
    ) {
      return;
    }
    setBusyTo(action.to);
    start(async () => {
      const result = await transitionInsightAction({ id, to: action.to });
      setBusyTo(null);
      if (result.ok) {
        toast(`Insight ${action.label.toLowerCase()}d`, "success");
        router.refresh();
      } else {
        toast(result.error ?? "Couldn't update the insight.", "danger");
      }
    });
  }

  return (
    <div className={styles.actions}>
      {actions.map((a) => (
        <Button
          key={a.to}
          type="button"
          variant={a.intent === "danger" ? "secondary" : "primary"}
          onClick={() => run(a)}
          loading={pending && busyTo === a.to}
          disabled={pending}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}
