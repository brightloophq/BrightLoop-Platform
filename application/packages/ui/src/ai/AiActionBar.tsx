"use client";

import { useState } from "react";
import { Icon } from "../components/Icon";
import { AiResultPanel } from "./AiResultPanel";
import { isBusy, activeKey } from "./state";
import type { AiActionDef, AiActionOutcome, AiExecutable, AiViewState } from "./types";
import styles from "./ai.module.css";

export interface AiActionBarProps {
  readonly actions: readonly AiActionDef[];
  /** Runs an action via the certified server-action path; UI never calls a provider. */
  readonly run: (actionKey: string) => Promise<AiActionOutcome>;
  /** Handle a gated executable follow-up (opens the existing confirm/approval flow). */
  readonly onExecute?: (exec: AiExecutable) => void;
  readonly label?: string;
}

/**
 * AiActionBar — the ONE shared AI action surface (PX.1e). A row of contextual AI
 * actions + an inline result panel. It owns only view state (loading/done); the
 * actual work is the injected `run`, which routes through a server action →
 * application use-case → capability gate → audited result. No per-page widgets, no
 * provider calls here. Keyboard/aria/reduced-motion + Light/Dark/System via tokens.
 */
export function AiActionBar({ actions, run, onExecute, label = "AI assist" }: AiActionBarProps) {
  const [state, setState] = useState<AiViewState>({ phase: "idle" });
  const [copied, setCopied] = useState(false);

  const busy = isBusy(state);
  const current = activeKey(state);

  async function invoke(key: string) {
    setCopied(false);
    setState({ phase: "loading", actionKey: key });
    try {
      const outcome = await run(key);
      setState({ phase: "done", actionKey: key, outcome });
    } catch {
      setState({ phase: "done", actionKey: key, outcome: { status: "error", message: "The AI action could not be completed. Please try again." } });
    }
  }

  async function copy() {
    if (state.phase !== "done" || state.outcome.status !== "ok") return;
    try {
      await navigator.clipboard.writeText(state.outcome.result.body);
      setCopied(true);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div className={styles.bar}>
      <div className={styles.actions}>
        <span className={styles.barLabel}><Icon name="sparkles" size={13} /> {label}</span>
        {actions.map((a) => {
          const running = busy && current === a.key;
          return (
            <button
              key={a.key}
              type="button"
              className={styles.action}
              data-active={current === a.key ? "true" : "false"}
              disabled={busy}
              aria-busy={running}
              onClick={() => invoke(a.key)}
            >
              <span className={running ? styles.spin : undefined}>
                <Icon name={running ? "activity" : a.icon} size={13} />
              </span>
              {a.label}
            </button>
          );
        })}
      </div>

      {state.phase === "done" && (
        <AiResultPanel
          outcome={state.outcome}
          onRetry={() => invoke(state.actionKey)}
          onExecute={onExecute}
          onCopy={copy}
          copied={copied}
        />
      )}
    </div>
  );
}
