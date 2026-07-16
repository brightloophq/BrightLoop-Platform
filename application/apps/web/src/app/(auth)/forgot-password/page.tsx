import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { isClientRole } from "@brightloop/schema";
import { Logo } from "@brightloop/ui";
import { getActor } from "@/lib/auth";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import styles from "../login/login.module.css";

export const metadata: Metadata = {
  title: "Forgot password",
  robots: { index: false, follow: false },
};

/** Forgot-password screen. Already-signed-in users go to their surface. */
export default async function ForgotPasswordPage() {
  const actor = await getActor();
  if (actor) redirect(isClientRole(actor.role) ? "/portal" : "/admin");

  return (
    <div className={styles.shell}>
      <aside className={styles.brandPanel}>
        <Logo variant="lockup" height={28} />
        <p className={styles.brandFoot}>© 2026 BrightLoop</p>
      </aside>
      <main className={styles.formPanel}>
        <div className={styles.formInner}>
          <h2 className={styles.title}>Reset your password</h2>
          <p className={styles.sub}>Enter your account email and we&apos;ll send you a secure link.</p>
          <ForgotPasswordForm />
        </div>
      </main>
    </div>
  );
}
