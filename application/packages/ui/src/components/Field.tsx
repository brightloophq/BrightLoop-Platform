import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import styles from "./Field.module.css";

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/**
 * Field shell — label + control + error/hint wiring.
 *
 * Accessibility (handoff §09.1): one message per field, rendered below it in
 * --danger, linked via aria-describedby with aria-invalid set. The error is
 * always text, never colour alone.
 */
function FieldShell({ label, error, hint, optional = false, children }: FieldShellProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {optional ? <span className={styles.optional}> (optional)</span> : null}
      </label>

      {children({ id, describedBy, invalid: Boolean(error) })}

      {error ? (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
}

export function Input({ label, error, hint, optional, className, ...rest }: InputProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          className={[styles.control, invalid ? styles.invalid : null, className]
            .filter(Boolean)
            .join(" ")}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
}

export function Textarea({ label, error, hint, optional, className, ...rest }: TextareaProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          className={[styles.control, styles.textarea, invalid ? styles.invalid : null, className]
            .filter(Boolean)
            .join(" ")}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      )}
    </FieldShell>
  );
}
