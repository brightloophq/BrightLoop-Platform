"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Input, Textarea } from "@brightloop/ui";
import styles from "./contact.module.css";

interface Errors {
  name?: string;
  email?: string;
  company?: string;
  message?: string;
}

/** Validation rules per handoff §09.2 (contact/booking). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(values: { name: string; email: string; company: string; message: string }): Errors {
  const errors: Errors = {};

  const name = values.name.trim();
  if (!name) errors.name = "Enter your name";
  else if (name.length > 80) errors.name = "Name must be 80 characters or fewer";

  const email = values.email.trim();
  if (!email) errors.email = "Enter a valid email";
  else if (!EMAIL_RE.test(email) || email.length > 254) errors.email = "Enter a valid email";

  if (values.company.trim().length > 120) errors.company = "Company must be 120 characters or fewer";

  const message = values.message.trim();
  if (!message) errors.message = "Tell us a little about your business";
  else if (message.length < 10) errors.message = "Message must be at least 10 characters";
  else if (message.length > 2000) errors.message = "Message must be 2,000 characters or fewer";

  return errors;
}

/**
 * Contact form (handoff §05 + §09).
 *
 * Validation behaviour per §09.1: validate on blur; on submit for the whole
 * form; re-validate on change only AFTER a field has errored once; never
 * validate an untouched field. Submit is disabled only while submitting — never
 * merely because the form is invalid, so submit can surface the errors.
 *
 * SUBMISSION IS NOT WIRED YET. The transactional email + n8n intake boundary is
 * Sprint 8, and bot protection (Turnstile, decision M) is Sprint 9. Rather than
 * fake a success state, this reports honestly that the channel is not live and
 * offers a mailto fallback.
 */
export function ContactForm({ fallbackEmail }: { fallbackEmail: string }) {
  const [values, setValues] = useState({ name: "", email: "", company: "", message: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  const set = (field: keyof typeof values) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    // Re-validate only once a field has already errored (§09.1).
    if (errors[field]) {
      setErrors(validate({ ...values, [field]: value }));
    }
  };

  const onBlur = (field: keyof typeof values) => () => {
    setTouched((t) => ({ ...t, [field]: true }));
    const next = validate(values);
    setErrors((e) => ({ ...e, [field]: next[field] }));
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = validate(values);
    setErrors(next);
    setTouched({ name: true, email: true, company: true, message: true });
    if (Object.keys(next).length > 0) return;
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <Alert tone="warning" title="This form isn't connected yet">
        Your message was <strong>not</strong> sent — the enquiry pipeline (transactional email and
        n8n intake) is scheduled for a later sprint, and we won&apos;t pretend otherwise. In the
        meantime, email us directly at{" "}
        <a href={`mailto:${fallbackEmail}`}>{fallbackEmail}</a> and we&apos;ll pick it up.
      </Alert>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <Input
        label="Name"
        name="name"
        autoComplete="name"
        value={values.name}
        onChange={(e) => set("name")(e.target.value)}
        onBlur={onBlur("name")}
        error={touched["name"] ? errors.name : undefined}
        maxLength={80}
      />
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={values.email}
        onChange={(e) => set("email")(e.target.value)}
        onBlur={onBlur("email")}
        error={touched["email"] ? errors.email : undefined}
      />
      <Input
        label="Company"
        name="company"
        optional
        autoComplete="organization"
        value={values.company}
        onChange={(e) => set("company")(e.target.value)}
        onBlur={onBlur("company")}
        error={touched["company"] ? errors.company : undefined}
        maxLength={120}
      />
      <Textarea
        label="What are you trying to fix or build?"
        name="message"
        value={values.message}
        onChange={(e) => set("message")(e.target.value)}
        onBlur={onBlur("message")}
        error={touched["message"] ? errors.message : undefined}
        hint="A sentence or two is plenty."
        maxLength={2000}
      />

      <Button type="submit" variant="primary" size="lg">
        Send enquiry
      </Button>
    </form>
  );
}
