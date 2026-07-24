import { Alert, OperationalPanel, SectionRule } from "@brightloop/ui";
import type { NextStageView } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

const TONE: Record<NextStageView["support"], "info" | "warning" | "neutral" | "success"> = {
  supported: "success",
  crawler_disabled: "warning",
  provider_disabled: "warning",
  unsupported: "neutral",
  complete: "info",
};

const NEXT_ACTION: Record<NextStageView["support"], string> = {
  supported: "Execute this stage to advance the pipeline by one step.",
  crawler_disabled: "Set AUXION_CRAWLER_ENABLED=true on the server, then retry this stage.",
  provider_disabled: "Enable AUXION_LIVE_AI_ENABLED and AUXION_ANTHROPIC_ENABLED with a valid key.",
  unsupported: "This stage has no runtime yet. Nothing is fabricated — the turn will return a stable blocked result.",
  complete: "No further stages will run for this scan.",
};

/**
 * What the NEXT run-once turn would do, and whether it can do it. Shown before
 * execution so the operator always knows the exact stage and its support state.
 */
export function StageReadiness({ next }: { next: NextStageView }) {
  return (
    <OperationalPanel>
      <SectionRule index="02" label="Next stage" meta={`${next.position} / ${next.total}`} />
      <div className={[styles.stageCallout, next.support === "supported" ? null : styles.stageCalloutMuted].filter(Boolean).join(" ")}>
        <span className={styles.stageLabel}>{next.label}</span>
        <span className={styles.stageReason}>{next.reason ?? "Supported by the current runtime."}</span>
      </div>
      <Alert tone={TONE[next.support]} title={next.support === "supported" ? "Ready to execute" : "Cannot execute yet"}>
        {NEXT_ACTION[next.support]}
      </Alert>
    </OperationalPanel>
  );
}
