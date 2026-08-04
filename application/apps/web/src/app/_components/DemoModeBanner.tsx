import { isDemoMode, demoToggleAvailable } from "@/lib/repositories";
import { setDemoModeAction } from "./demo-actions";
import styles from "./DemoModeBanner.module.css";

/**
 * Demo Mode indicator + developer toggle (PX.1b). Renders only outside real
 * production, so demo content is never silently mistaken for real customer data
 * and a customer deployment shows nothing. When Demo Mode is ON it reads as an
 * amber "Demo data" banner; when OFF it is a muted bar offering to enable it.
 * The toggle flips the override cookie via a server action.
 */
export async function DemoModeBanner() {
  if (!demoToggleAvailable()) return null;
  const on = await isDemoMode();
  return (
    <div className={on ? styles.banner : styles.bannerOff} role="status">
      <span className={on ? styles.dot : styles.dotOff} aria-hidden="true" />
      <span className={styles.text}>
        {on ? (
          <>
            <strong>Demo data</strong> — this environment is populated with sample organizations for
            demonstration. No real customer data is shown, and changes are disabled.
          </>
        ) : (
          <>
            <strong>Demo Mode off</strong> — showing live data.
          </>
        )}
      </span>
      <form action={setDemoModeAction} className={styles.form}>
        <input type="hidden" name="next" value={on ? "off" : "on"} />
        <button type="submit" className={styles.toggle}>
          {on ? "Turn off" : "Enable demo data"}
        </button>
      </form>
    </div>
  );
}
