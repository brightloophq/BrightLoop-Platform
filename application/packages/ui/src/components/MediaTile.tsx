import { resolveEmbed } from "./mediaEmbed";
import styles from "./MediaTile.module.css";

export interface MediaTileProps {
  kind: string;
  label: string;
  url?: string;
  /** Image-slot id. Present means "real asset outstanding for this slot". */
  slot?: string;
}

/**
 * MediaTile — a gallery/media item: a video, an image, or a link to live work.
 *
 * It used to render the PLACEHOLDER state unconditionally, because the design
 * bundle supplied drag-and-drop image *slots* rather than images. That made the
 * portfolio structurally complete but visually empty: a case study with a real
 * YouTube walkthrough and a real live URL still showed "Asset pending". Now the
 * URL decides — `resolveEmbed` maps it to an embed, a playable file, an image or
 * a link — and the placeholder is what remains when there genuinely is nothing,
 * naming the slot so the gap stays legible instead of looking broken.
 *
 * Only allow-listed providers are ever framed; see the security note in
 * `mediaEmbed.ts`. Everything else degrades to a link.
 *
 * Alt text: `label` is the catalogued human description of the item, so it is
 * the image's alt. A tile with no real label would be a content bug, not a
 * rendering one.
 */
export function MediaTile({ kind, label, url, slot }: MediaTileProps) {
  const embed = resolveEmbed(url);

  return (
    <figure className={styles.tile}>
      <div className={embed.kind === "pending" ? styles.frame : styles.media}>
        {embed.kind === "iframe" ? (
          <iframe
            className={styles.fill}
            src={embed.src}
            title={`${label} — ${embed.provider} video`}
            loading="lazy"
            // Only what a video player needs. No allow-same-origin, no scripts
            // beyond the provider's own player surface.
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : embed.kind === "video" ? (
          // No autoplay: a gallery that starts talking at you is hostile, and
          // it would also fight a screen reader.
          <video className={styles.fill} src={embed.src} controls preload="metadata" playsInline />
        ) : embed.kind === "image" ? (
          <img className={styles.fill} src={embed.src} alt={label} loading="lazy" />
        ) : embed.kind === "link" ? (
          <a className={styles.linkFrame} href={embed.src} target="_blank" rel="noopener noreferrer">
            <span className={styles.kind}>{kind}</span>
            <span className={styles.linkHost}>{embed.provider ?? "Open"}</span>
          </a>
        ) : (
          <>
            <span className={styles.kind}>{kind}</span>
            <span className={styles.pending}>
              {slot ? `Asset pending — slot “${slot}”` : "Asset pending"}
            </span>
          </>
        )}
      </div>
      <figcaption className={styles.caption}>
        <span>{label}</span>
        {embed.src ? (
          <a href={embed.src} className={styles.link} target="_blank" rel="noopener noreferrer">
            Open
          </a>
        ) : null}
      </figcaption>
    </figure>
  );
}
