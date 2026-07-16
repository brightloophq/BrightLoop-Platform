"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Button, Input } from "@brightloop/ui";
import { requestPasswordReset, type AuthState } from "../actions";
import styles from "../login/login.module.css";

const EMPTY: AuthState = {};

/** Forgot-password: enter email → we send a reset link (Step 1–2). */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, EMPTY);

  return (
    <div className={styles.form}>
      {state.error ? (
        <Alert tone="danger" title="Couldn't send the link">
          {state.error}
        </Alert>
      ) : null}
      {state.notice ? <Alert tone="success">{state.notice}</Alert> : null}

      {!state.notice ? (
        <form action={action} className={styles.fields} noValidate>
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            hint="We'll email you a secure link to set a new password."
            required
          />
          <Button type="submit" variant="primary" size="lg" block loading={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      ) : null}

      <p className={styles.foot}>
        <Link href="/login">Back to sign in</Link>
      </p>
    </div>
  );
}
