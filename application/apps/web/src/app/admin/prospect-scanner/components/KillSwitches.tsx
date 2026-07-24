import type { RuntimeFlags } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

/**
 * The system-state chips: which runtime capabilities are live right now. Both
 * switches default OFF, so an operator can always see why a stage will block
 * before they click anything.
 */
export function KillSwitches({ flags }: { flags: RuntimeFlags }) {
  const chips: { label: string; on: boolean; title: string }[] = [
    { label: flags.crawlerEnabled ? "Crawler live" : "Crawler off", on: flags.crawlerEnabled, title: "AUXION_CRAWLER_ENABLED" },
    { label: flags.providerEnabled ? "Reasoning live" : "Reasoning off", on: flags.providerEnabled, title: "AUXION_LIVE_AI_ENABLED + AUXION_ANTHROPIC_ENABLED" },
  ];

  return (
    <div className={styles.switches} role="group" aria-label="Runtime kill switches">
      {chips.map((c) => (
        <span key={c.label} className={[styles.switch, c.on ? styles.switchOn : null].filter(Boolean).join(" ")} title={c.title}>
          <span className={styles.switchDot} aria-hidden="true" />
          {c.label}
        </span>
      ))}
      {flags.modelId ? <span className={styles.switch}>Model · {flags.modelId}</span> : null}
      {flags.estimatedMaxCostUsd !== null ? (
        <span className={styles.switch}>Max ≈ ${flags.estimatedMaxCostUsd.toFixed(2)} / turn</span>
      ) : null}
    </div>
  );
}
