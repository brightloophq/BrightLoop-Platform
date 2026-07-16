"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Alert, Button, Input } from "@brightloop/ui";
import { signInWithMagicLink, signInWithPassword, type AuthState } from "../actions";
import styles from "./login.module.css";

const EMPTY: AuthState = {};

export interface LoginFormProps {
  /** A one-off message from a redirect (e.g. after a password reset or a bad link). */
  urlError?: string;
  urlNotice?: string;
}

/**
 * Login form (handoff §05 auth screens).
 *
 * Approved Decision C: email + password and magic link. Google/Microsoft/SSO are
 * V2 — there are deliberately no provider buttons here.
 *
 * Per handoff §09.1 submit is disabled only while submitting, never merely
 * because the form looks invalid — let submit surface the error.
 */
export function LoginForm({ urlError, urlNotice }: LoginFormProps = {}) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, EMPTY);
  const [mlState, mlAction, mlPending] = useActionState(signInWithMagicLink, EMPTY);

  const state = mode === "password" ? pwState : mlState;
  const pending = mode === "password" ? pwPending : mlPending;
  // Action-state messages take precedence over the one-off redirect message.
  const shownError = state.error ?? urlError;
  const shownNotice = state.notice ?? urlNotice;

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

      {shownError ? (
        <Alert tone="danger" title="Couldn't sign you in">
          {shownError}
        </Alert>
      ) : null}
      {shownNotice ? <Alert tone="success">{shownNotice}</Alert> : null}

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
          <p className={styles.foot} style={{ marginTop: "var(--space-2)", textAlign: "center" }}>
            <Link href="/forgot-password">Forgot password?</Link>
          </p>
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
