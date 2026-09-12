"use client";

import { useState } from "react";
import { MEDIA_KINDS, type MediaItem, type MediaKind } from "@brightloop/schema";
import { Button, Input, resolveEmbed } from "@brightloop/ui";
import styles from "../cms.module.css";

interface Row {
  kind: MediaKind;
  label: string;
  url: string;
}

const KIND_LABELS: Record<MediaKind, string> = {
  image: "Image",
  video: "Video file",
  youtube: "YouTube",
  loom: "Loom",
  audio: "Audio",
  pdf: "PDF",
  website: "Website",
};

function blank(): Row {
  return { kind: "image", label: "", url: "" };
}

/**
 * Media for a portfolio project — the photos, films and links that make a case
 * study look like work rather than a form submission.
 *
 * Three PARALLEL form arrays (`mediaKind`, `mediaLabel`, `mediaUrl`), one entry
 * per row including the empty ones, so `saveProject` can zip them back together
 * by index without parsing user-supplied JSON. Rows with no URL are dropped
 * server-side — clearing a URL is how you delete an item.
 *
 * The verdict line under each URL is the point of this component. The public
 * Work tile only paints a URL that `resolveEmbed` classifies as an image
 * (https + a known image extension), and that gate is deliberate — it is what
 * keeps an arbitrary host out of an `<img>`. Without the verdict, an owner would
 * paste a perfectly good-looking CDN link with no file extension, save, and find
 * the tile still showing its monogram with nothing to explain why. So the form
 * tells them what each URL will actually do BEFORE they save.
 */
export function MediaFields({ media = [] }: { media?: readonly MediaItem[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    media.length > 0
      ? media.map((m) => ({ kind: m.kind, label: m.label, url: m.url ?? "" }))
      : [blank()],
  );

  const update = (i: number, patch: Partial<Row>) =>
    setRows((cur) => cur.map((row, n) => (n === i ? { ...row, ...patch } : row)));

  // Never drop to zero rows: an empty list with no visible row looks like the
  // feature is missing, which is exactly the state this component fixes.
  const remove = (i: number) =>
    setRows((cur) => (cur.length === 1 ? [blank()] : cur.filter((_, n) => n !== i)));

  return (
    <div className={styles.formFull}>
      <span className={styles.hint}>Media</span>
      <p className={styles.hint} style={{ marginTop: "var(--space-1)" }}>
        The first <strong>image</strong> here becomes the project&apos;s picture on the Work page.
        Paste a direct link to the file — one ending in .jpg, .png, .webp, .avif, .gif or .svg.
        Everything else (a film, a PDF, the live site) shows on the case study.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
        {rows.map((row, i) => {
          const embed = resolveEmbed(row.url);
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "150px minmax(0, 1fr) minmax(0, 2fr) auto",
                gap: "var(--space-3)",
                alignItems: "start",
                padding: "var(--space-3)",
                background: "var(--surface-inset)",
                border: "var(--border-hairline)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div>
                <label className={styles.hint} htmlFor={`mediaKind-${i}`}>
                  Type
                </label>
                <select
                  id={`mediaKind-${i}`}
                  name="mediaKind"
                  className={styles.select}
                  style={{ width: "100%", height: 44 }}
                  value={row.kind}
                  onChange={(e) => update(i, { kind: e.target.value as MediaKind })}
                >
                  {MEDIA_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Caption"
                name="mediaLabel"
                optional
                value={row.label}
                onChange={(e) => update(i, { label: e.target.value })}
                maxLength={120}
                placeholder="Homepage"
              />

              <div>
                <Input
                  label="URL"
                  name="mediaUrl"
                  type="url"
                  value={row.url}
                  onChange={(e) => update(i, { url: e.target.value })}
                  placeholder="https://…/homepage.jpg"
                />
                <Verdict url={row.url} kind={embed.kind} provider={embed.provider} />
              </div>

              <div style={{ paddingTop: 26 }}>
                <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "var(--space-3)" }}>
        <Button type="button" variant="secondary" size="sm" onClick={() => setRows((c) => [...c, blank()])}>
          Add another item
        </Button>
      </div>
    </div>
  );
}

/** Says, in words, what the public site will do with this URL. */
function Verdict({
  url,
  kind,
  provider,
}: {
  url: string;
  kind: ReturnType<typeof resolveEmbed>["kind"];
  provider?: string;
}) {
  if (url.trim() === "") {
    return (
      <p className={styles.hint} style={{ marginTop: "var(--space-2)" }}>
        Leave the URL empty to remove this item.
      </p>
    );
  }

  if (kind === "pending") {
    return (
      <p className={styles.hint} style={{ marginTop: "var(--space-2)", color: "var(--caution)" }}>
        Not a usable URL yet. It must be a full address starting with https://
      </p>
    );
  }

  if (kind === "image") {
    return (
      <p className={styles.hint} style={{ marginTop: "var(--space-2)", color: "var(--positive)" }}>
        Will show as a picture — and if it is the first image on this project, it becomes the Work
        page tile.
      </p>
    );
  }

  if (kind === "video") {
    return (
      <p className={styles.hint} style={{ marginTop: "var(--space-2)", color: "var(--positive)" }}>
        Will play on the case study. The Work page tile still needs an image.
      </p>
    );
  }

  if (kind === "iframe") {
    return (
      <p className={styles.hint} style={{ marginTop: "var(--space-2)", color: "var(--positive)" }}>
        Will embed as a {provider} player on the case study. The Work page tile still needs an
        image.
      </p>
    );
  }

  return (
    <p className={styles.hint} style={{ marginTop: "var(--space-2)", color: "var(--caution)" }}>
      Will appear as a link, not a picture. For a photo, the address has to end in .jpg, .png,
      .webp, .avif, .gif or .svg — a link with no file extension can&apos;t be shown as an image.
    </p>
  );
}
