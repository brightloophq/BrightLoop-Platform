import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { isClientRole } from "@brightloop/schema";
import { Eyebrow, Logo } from "@brightloop/ui";
import { getActor } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/**
 * Sign-in (handoff §05 — split brand-panel + form shell).
 *
 * Already-signed-in users are bounced to their own surface rather than shown a
 * login form they don't need.
 */
export default async function LoginPage() {
  const actor = await getActor();
  if (actor) redirect(isClientRole(actor.role) ? "/portal" : "/admin");

  return (
    <div className={styles.shell}>
      <aside className={styles.brandPanel}>
        <Logo variant="lockup" height={28} />
        <div className={styles.brandCopy}>
          <Eyebrow>Brand · Build · Automate · Grow</Eyebrow>
          <h1 className={styles.brandTitle}>Your business, in one loop.</h1>
          <p className={styles.brandBody}>
            Track your project, approve work, and see where your business stands — all in one place.
          </p>
        </div>
        <p className={styles.brandFoot}>© 2026 BrightLoop</p>
      </aside>

      <main className={styles.formPanel}>
        <div className={styles.formInner}>
          <h2 className={styles.title}>Sign in</h2>
          <p className={styles.sub}>Welcome back. Use your password or have a link emailed to you.</p>

          <LoginForm />

          <p className={styles.foot}>
            BrightLoop accounts are created by invitation — clients are invited when their project
            starts, and team accounts are created by the owner. There is no public sign-up.
          </p>
        </div>
      </main>
    </div>
  );
}
