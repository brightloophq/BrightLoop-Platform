"use client";

import { useActionState } from "react";
import { Alert, Button, Input } from "@brightloop/ui";
import { updatePassword, type AuthState } from "../actions";
import styles from "../login/login.module.css";

const EMPTY: AuthState = {};

/** Set a new password using the recovery session (Step 5–7). */
export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, EMPTY);

  return (
    <div className={styles.form}>
      {state.error ? (
        <Alert tone="danger" title="Couldn't update your password">
          {state.error}
        </Alert>
      ) : null}

      <form action={action} className={styles.fields} noValidate>
        <Input
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters, with a letter and a number."
          required
        />
        <Input
          label="Confirm new password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
        <Button type="submit" variant="primary" size="lg" block loading={pending}>
          {pending ? "Updating…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
