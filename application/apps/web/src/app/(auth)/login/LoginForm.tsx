"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Input } from "@brightloop/ui";
import { signInWithMagicLink, signInWithPassword, type AuthState } from "../actions";
import styles from "./login.module.css";

const EMPTY: AuthState = {};

/**
 * Login form (handoff §05 auth screens).
 *
 * Approved Decision C: email + password and magic link. Google/Microsoft/SSO are
 * V2 — there are deliberately no provider buttons here.
 *
 * Per handoff §09.1 submit is disabled only while submitting, never merely
 * because the form looks invalid — let submit surface the error.
 */
export function LoginForm() {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, EMPTY);
  const [mlState, mlAction, mlPending] = useActionState(signInWithMagicLink, EMPTY);

  const state = mode === "password" ? pwState : mlState;
  const pending = mode === "password" ? pwPending : mlPending;

  return (
    <div className={styles.form}>
      <div className={styles.tabs} role="tablist" aria-label="Sign-in method">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "password"}
          className={[styles.tab, mode === "password" ? styles.tabActive : null]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setMode("password")}
        >
          Password
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "magic"}
          className={[styles.tab, mode === "magic" ? styles.tabActive : null]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setMode("magic")}
        >
          Magic link
        </button>
      </div>

      {state.error ? (
        <Alert tone="danger" title="Couldn't sign you in">
          {state.error}
        </Alert>
      ) : null}
      {state.notice ? <Alert tone="success">{state.notice}</Alert> : null}

      {mode === "password" ? (
        <form action={pwAction} className={styles.fields} noValidate>
          <Input label="Email" name="email" type="email" autoComplete="email" required />
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <Button type="submit" variant="primary" size="lg" block loading={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      ) : (
        <form action={mlAction} className={styles.fields} noValidate>
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            hint="We'll email you a link that signs you in — no password needed."
            required
          />
          <Button type="submit" variant="primary" size="lg" block loading={pending}>
            {pending ? "Sending…" : "Email me a link"}
          </Button>
        </form>
      )}
    </div>
  );
}
