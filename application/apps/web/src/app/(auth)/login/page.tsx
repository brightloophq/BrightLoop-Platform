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

/** Friendly copy for the one-off codes the callback / recovery routes redirect with. */
const ERROR_COPY: Record<string, string> = {
  missing_code: "That link was incomplete. Please try signing in again.",
  invalid_link: "That sign-in link was invalid or has expired. Request a new one.",
  norole: "You're signed in, but this account has no role yet. Please contact Auxion.",
  recovery_invalid: "That password-reset link was invalid. Request a new one from Forgot password.",
  recovery_expired: "Your password-reset link expired or was already used. Request a new one.",
};
const NOTICE_COPY: Record<string, string> = {
  password_updated: "Your password has been updated. Sign in with your new password.",
};

/**
 * Sign-in (handoff §05 — split brand-panel + form shell).
 *
 * Already-signed-in users are bounced to their own surface rather than shown a
 * login form they don't need.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const actor = await getActor();
  if (actor) redirect(isClientRole(actor.role) ? "/portal" : "/admin");

  const sp = await searchParams;
  const urlError = sp.error ? ERROR_COPY[sp.error] : undefined;
  const urlNotice = sp.notice ? NOTICE_COPY[sp.notice] : undefined;

  return (
    <div className={styles.shell}>
      <aside className={styles.brandPanel} data-theme="dark">
        <Logo variant="lockup" height={28} />
        <div className={styles.brandCopy}>
          <Eyebrow>Brand · Build · Automate · Grow</Eyebrow>
          <h1 className={styles.brandTitle}>Your business, in one loop.</h1>
          <p className={styles.brandBody}>
            Track your project, approve work, and see where your business stands — all in one place.
          </p>
        </div>
        <p className={styles.brandFoot}>© 2026 Auxion</p>
      </aside>

      <main className={styles.formPanel}>
        <div className={styles.formInner}>
          <h2 className={styles.title}>Sign in</h2>
          <p className={styles.sub}>Welcome back. Use your password or have a link emailed to you.</p>

          <LoginForm urlError={urlError} urlNotice={urlNotice} />

          <p className={styles.foot}>
            Auxion accounts are created by invitation — clients are invited when their project
            starts, and team accounts are created by the owner. There is no public sign-up.
          </p>
        </div>
      </main>
    </div>
  );
}
