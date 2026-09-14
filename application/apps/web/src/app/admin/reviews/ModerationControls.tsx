"use client";

import { useState, useTransition } from "react";
import { PUBLISH, PUBLISH_STATES } from "@brightloop/schema";
import { Alert } from "@brightloop/ui";
import { moderateProject, moderateTestimonial } from "../reputation-actions";
import styles from "../cms.module.css";

type Kind = "testimonial" | "project";

interface Props {
  kind: Kind;
  id: string;
  slug?: string;
  publish: string;
  pinned?: boolean;
  featuredOnHome: boolean;
  /** Pin only applies to reviews (handoff §08). */
  showPin?: boolean;
}

/**
 * Moderation controls — publish status, pin, feature-on-home (handoff §08).
 *
 * Every control posts to a server action which re-checks `marketing.*` before
 * writing, and RLS refuses it independently. Nothing here is trusted.
 *
 * The publish select is the ONLY route to the public site: `draft` and `private`
 * are hidden by RLS, so changing this dropdown is the deliberate act of making
 * something public. Which is exactly why a failure here cannot be silent: this
 * component used to `await action(fd)` and DISCARD the result, so a refused or
 * no-op publish looked identical to a successful one. The case study simply
 * never appeared on the site, with nothing anywhere to say why.
 *
 * The select stays bound to the SERVER's value, never to local state. On failure
 * the server never revalidated, so the control correctly snaps back to what is
 * actually stored — and the error says why it did.
 */
export function ModerationControls({
  kind,
  id,
  slug,
  publish,
  pinned = false,
  featuredOnHome,
  showPin = false,
}: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const action = kind === "testimonial" ? moderateTestimonial : moderateProject;

  const send = (fields: Record<string, string>) => {
    setError(null);
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("id", id);
        if (slug) fd.set("slug", slug);
        for (const [k, v] of Object.entries(fields)) fd.set(k, v);

        const result = await action(fd);
        // On success the page revalidates and the new value arrives as a prop;
        // there is no success state to render. A FAILURE is the whole point.
        if (!result.ok) setError(result.error ?? "That change was not saved.");
      } catch (e) {
        // A rejected action must not leave the control looking like it worked.
        setError(e instanceof Error ? e.message : "That change was not saved.");
      }
    });
  };

  return (
    <div className={styles.controls} aria-busy={pending}>
      {error ? (
        <div className={styles.formFull}>
          <Alert tone="danger" title="Not saved">
            {error}
          </Alert>
        </div>
      ) : null}

      {showPin ? (
        <button
          type="button"
          className={[styles.toggle, pinned ? styles.toggleOn : null].filter(Boolean).join(" ")}
          onClick={() => send({ pinned: String(!pinned) })}
          disabled={pending}
          aria-pressed={pinned}
          title="Pinned reviews sort first on the public wall"
        >
          Pin
        </button>
      ) : null}

      <button
        type="button"
        className={[styles.toggle, featuredOnHome ? styles.toggleOn : null].filter(Boolean).join(" ")}
        onClick={() => send({ featuredOnHome: String(!featuredOnHome) })}
        disabled={pending}
        aria-pressed={featuredOnHome}
        title="Featured items surface on the homepage automatically"
      >
        Home
      </button>

      <select
        className={styles.select}
        value={publish}
        disabled={pending}
        onChange={(e) => send({ publish: e.target.value })}
        aria-label="Publish status"
      >
        {PUBLISH_STATES.map((s) => (
          <option key={s} value={s}>
            {PUBLISH[s].label}
            {PUBLISH[s].public ? " · live" : " · hidden"}
          </option>
        ))}
      </select>
    </div>
  );
}
