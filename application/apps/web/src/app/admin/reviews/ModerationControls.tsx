"use client";

import { useTransition } from "react";
import { PUBLISH, PUBLISH_STATES } from "@brightloop/schema";
import { Icon } from "@brightloop/ui";
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
 * something public.
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
  const action = kind === "testimonial" ? moderateTestimonial : moderateProject;

  const send = (fields: Record<string, string>) => {
    start(async () => {
      const fd = new FormData();
      fd.set("id", id);
      if (slug) fd.set("slug", slug);
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      await action(fd);
    });
  };

  return (
    <div className={styles.controls} aria-busy={pending}>
      {showPin ? (
        <button
          type="button"
          className={[styles.toggle, pinned ? styles.toggleOn : null].filter(Boolean).join(" ")}
          onClick={() => send({ pinned: String(!pinned) })}
          disabled={pending}
          aria-pressed={pinned}
          title="Pinned reviews sort first on the public wall"
        >
          <Icon name="star" size={13} />
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
        <Icon name="heart" size={13} />
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
