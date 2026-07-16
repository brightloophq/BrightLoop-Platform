import Link from "next/link";
import type { Metadata } from "next";
import { Alert, Logo } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./ResetPasswordForm";
import styles from "../login/login.module.css";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false, follow: false },
};

/**
 * Update-password screen. Reached from the reset email via /auth/reset, which has
 * already exchanged the code for a recovery session. If there is no session (the
 * link was expired, already used, or the page was opened directly), we show a
 * clear "request a new link" state instead of a form that can't work.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const hasRecoverySession = Boolean(data?.claims);

  return (
    <div className={styles.shell}>
      <aside className={styles.brandPanel}>
        <Logo variant="lockup" height={28} />
        <p className={styles.brandFoot}>© 2026 BrightLoop</p>
      </aside>
      <main className={styles.formPanel}>
        <div className={styles.formInner}>
          <h2 className={styles.title}>Set a new password</h2>
          {hasRecoverySession ? (
            <>
              <p className={styles.sub}>Choose a new password for your account.</p>
              <ResetPasswordForm />
            </>
          ) : (
            <div className={styles.form}>
              <Alert tone="warning" title="This reset link is no longer valid">
                It may have expired or already been used. Request a fresh link and try again.
              </Alert>
              <p className={styles.foot}>
                <Link href="/forgot-password">Request a new reset link</Link> · <Link href="/login">Back to sign in</Link>
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
