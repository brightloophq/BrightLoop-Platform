"use client";

import { useRef, useState } from "react";
import { MEDIA_KINDS, type MediaItem, type MediaKind } from "@brightloop/schema";
import { Button, Input, resolveEmbed } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/client";
import {
  ACCEPTED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  tooLargeMessage,
} from "@/lib/media-upload";
import { createProjectImageUpload } from "../reputation-actions";
import styles from "../cms.module.css";

interface Row {
  kind: MediaKind;
  label: string;
  url: string;
  /** Per-row upload state — one row uploading must not disable the others. */
  uploading?: boolean;
  uploadError?: string;
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

  /**
   * Upload the chosen file and drop the resulting public URL into this row.
   *
   * The bytes go BROWSER → SUPABASE directly, never through our server. A
   * server action caps its request body at 1 MB by default, so the first
   * revision of this — which posted the File to an action — hung on every real
   * photograph. The action is still called, but only to mint a one-time signed
   * upload token after its capability check.
   *
   * The upload runs on choose rather than on submit, so the verdict line can
   * confirm the image is usable BEFORE the project is saved, and a failure costs
   * a retry rather than the whole form.
   *
   * EVERY path out of here clears `uploading`. The try/catch is not decoration:
   * without it a rejected promise left the button spinning forever with nothing
   * said, which is exactly how this went wrong the first time.
   */
  async function upload(i: number, file: File) {
    update(i, { uploading: true, uploadError: undefined });

    try {
      // Fail fast and locally on an oversized file, rather than spending the
      // round trip to be told by the bucket.
      if (file.size > MAX_UPLOAD_BYTES) {
        update(i, { uploading: false, uploadError: tooLargeMessage(file.size) });
        return;
      }

      const body = new FormData();
      body.append("filename", file.name);
      body.append("mime", file.type);
      body.append("size", String(file.size));

      const ticket = await createProjectImageUpload(body);
      if (!ticket.ok) {
        update(i, { uploading: false, uploadError: ticket.error });
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.storage
        .from("media")
        .uploadToSignedUrl(ticket.path, ticket.token, file, {
          contentType: file.type || undefined,
        });

      if (error) {
        update(i, { uploading: false, uploadError: error.message });
        return;
      }

      // An uploaded file is always an image — the ticket refuses anything else.
      update(i, { uploading: false, url: ticket.publicUrl, kind: "image" });
    } catch (e) {
      update(i, {
        uploading: false,
        uploadError: e instanceof Error ? e.message : "Upload failed. Try again.",
      });
    }
  }

  return (
    <div className={styles.formFull}>
      <span className={styles.hint}>Media</span>
      <p className={styles.hint} style={{ marginTop: "var(--space-1)" }}>
        The first <strong>image</strong> here becomes the project&apos;s picture on the Work page.
        Upload a file from your computer, or paste a direct link to one. Everything else — a film,
        a PDF, the client&apos;s live site — shows on the case study.
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
                  onChange={(e) => update(i, { url: e.target.value, uploadError: undefined })}
                  placeholder="https://…/homepage.jpg"
                />

                <UploadButton
                  uploading={row.uploading === true}
                  onFile={(file) => upload(i, file)}
                />

                {row.uploadError ? (
                  <p className={styles.hint} style={{ marginTop: "var(--space-2)", color: "var(--critical)" }}>
                    {row.uploadError}
                  </p>
                ) : (
                  <Verdict url={row.url} kind={embed.kind} provider={embed.provider} />
                )}
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

/**
 * The file picker. A plain `<input type="file">` driven by a Button, because a
 * bare file input cannot be styled to match anything else on this form — and it
 * carries NO `name`, so it never reaches the server action that saves the
 * project; the only thing that submits is the URL it produces.
 */
function UploadButton({
  uploading,
  onFile,
}: {
  uploading: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ marginTop: "var(--space-2)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_UPLOAD_TYPES}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          // Reset, so choosing the SAME file again still fires a change event.
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "Uploading…" : "Upload a file"}
      </Button>
      <span className={styles.hint}>or paste a link above</span>
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
