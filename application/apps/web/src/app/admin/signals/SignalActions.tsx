"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@brightloop/ui";
import type { SignalAction } from "@brightloop/domain";
import { transitionSignalAction } from "./signals-actions";
import styles from "./signals.module.css";

/**
 * The lifecycle actions for a signal. Only actions currently legal for its state
 * are shown (the server re-validates and the DB guard re-enforces). Terminal
 * (Archive) requires an explicit confirmation. Feedback is a toast + a server
 * refresh so the status badge and history reflect the change immediately.
 */
export function SignalActions({ id, actions }: { id: string; actions: SignalAction[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [busyTo, setBusyTo] = useState<string | null>(null);

  if (actions.length === 0) return null;

  function run(action: SignalAction) {
    if (action.confirm && !window.confirm("Archive this signal? Archived signals are closed and cannot be reopened.")) {
      return;
    }
    setBusyTo(action.to);
    start(async () => {
      const result = await transitionSignalAction({ id, to: action.to });
      setBusyTo(null);
      if (result.ok) {
        toast(`Signal ${action.label.toLowerCase()}d`, "success");
        router.refresh();
      } else {
        toast(result.error ?? "Couldn't update the signal.", "danger");
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
