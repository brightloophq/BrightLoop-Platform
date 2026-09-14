"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Alert, Button, Input, Textarea } from "@brightloop/ui";
import { TurnstileWidget } from "../start/TurnstileWidget";
import { submitContactEnquiry } from "./actions";
import {
  LIMITS,
  validateEnquiry,
  type ContactEnquiryInput,
  type ContactErrors,
} from "@/lib/contact-enquiry";
import styles from "./contact.module.css";

/**
 * Contact form (handoff §05 + §09).
 *
 * Validation behaviour per §09.1: validate on blur; on submit for the whole
 * form; re-validate on change only AFTER a field has errored once; never
 * validate an untouched field.
 *
 * SUBMISSION IS WIRED. It writes the enquiry into the leads pipeline through
 * `bl_submit_contact_enquiry`, so it lands somewhere durable and shows up in
 * the admin. This form used to validate every field and then tell the visitor
 * their message had NOT been sent, offering a mailto instead — honest, and the
 * single most expensive gap on the site, since it is the one page whose whole
 * purpose is to capture an enquiry.
 *
 * It still does not send an email: no transactional provider is configured, and
 * a form whose only record is an email is one mail failure away from losing an
 * enquiry. The record comes first; notification can be added on top of it.
 * The mailto stays as the fallback on the failure path, where it is now a real
 * fallback rather than the only path.
 */
export function ContactForm({ fallbackEmail }: { fallbackEmail: string }) {
  const [values, setValues] = useState<ContactEnquiryInput>({ name: "", email: "", company: "", message: "" });
  const [errors, setErrors] = useState<ContactErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (field: keyof ContactEnquiryInput) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    // Re-validate only once a field has already errored (§09.1).
    if (errors[field]) {
      setErrors(validateEnquiry({ ...values, [field]: value }));
    }
  };

  const onBlur = (field: keyof ContactEnquiryInput) => () => {
    setTouched((t) => ({ ...t, [field]: true }));
    const next = validateEnquiry(values);
    setErrors((e) => ({ ...e, [field]: next[field] }));
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    const next = validateEnquiry(values);
    setErrors(next);
    setTouched({ name: true, email: true, company: true, message: true });
    if (Object.keys(next).length > 0) return;

    // Read the Turnstile token off the form itself — the widget renders a hidden
    // input, and renders nothing at all when no site key is configured.
    const form = e.currentTarget;
    const data = new FormData(form);
    data.set("name", values.name);
    data.set("email", values.email);
    data.set("company", values.company);
    data.set("message", values.message);

    startTransition(async () => {
      const result = await submitContactEnquiry(data);
      if (result.ok) {
        setSent(true);
        return;
      }
      // The server re-runs the same rules; when it disagrees with the browser,
      // the server is right and its per-field errors replace ours.
      if (result.fieldErrors) setErrors(result.fieldErrors);
      setFormError(result.error ?? "Your enquiry couldn't be sent.");
    });
  };

  if (sent) {
    return (
      <Alert tone="success" title="Enquiry received">
        Thank you — your message is with us and someone will read it and reply as soon as we can.
        If it is urgent, you can also reach us at{" "}
        <a href={`mailto:${fallbackEmail}`}>{fallbackEmail}</a>.
      </Alert>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {formError ? (
        <Alert tone="danger" title="Couldn't send your enquiry">
          {formError} You can always email us directly at{" "}
          <a href={`mailto:${fallbackEmail}`}>{fallbackEmail}</a>.
        </Alert>
      ) : null}

      <Input
        label="Name"
        name="name"
        autoComplete="name"
        value={values.name}
        onChange={(e) => set("name")(e.target.value)}
        onBlur={onBlur("name")}
        error={touched["name"] ? errors.name : undefined}
        maxLength={LIMITS.name}
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
        maxLength={LIMITS.company}
      />
      <Textarea
        label="What are you trying to fix or build?"
        name="message"
        value={values.message}
        onChange={(e) => set("message")(e.target.value)}
        onBlur={onBlur("message")}
        error={touched["message"] ? errors.message : undefined}
        hint="A sentence or two is plenty."
        maxLength={LIMITS.message}
      />

      <TurnstileWidget />

      {/* Disabled only while sending — never merely because the form is invalid,
          so pressing it is what surfaces the errors (§09.1). */}
      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Send enquiry"}
      </Button>
    </form>
  );
}
