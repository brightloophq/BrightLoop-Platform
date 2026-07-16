import { Icon } from "./Icon";
import styles from "./MediaTile.module.css";

export interface MediaTileProps {
  kind: string;
  label: string;
  url?: string;
  /** Image-slot id. Present means "real asset outstanding for this slot". */
  slot?: string;
}

const KIND_ICON: Record<string, string> = {
  image: "layout-grid",
  video: "mouse-pointer-click",
  youtube: "mouse-pointer-click",
  loom: "mouse-pointer-click",
  audio: "mouse-pointer-click",
  pdf: "search",
  website: "external-link",
};

/**
 * MediaTile — a gallery/media item.
 *
 * Every tile currently renders its PLACEHOLDER state: the design bundle supplies
 * drag-and-drop image *slots*, not images (handoff §13 — "Real photography" is
 * outstanding). Rather than an empty grey box, the tile names what is missing and
 * which slot it belongs to, so the gap is legible instead of looking broken.
 *
 * Alt text is required on every real image (handoff §10.1) — that is enforced in
 * the Media Library when real assets are uploaded (Sprint 4).
 */
export function MediaTile({ kind, label, url, slot }: MediaTileProps) {
  const isExternal = Boolean(url && url !== "#");

  return (
    <figure className={styles.tile}>
      <div className={styles.frame}>
        <span className={styles.kind}>
          <Icon name={KIND_ICON[kind] ?? "layout-grid"} size={14} />
          {kind}
        </span>
        <span className={styles.pending}>
          {slot ? `Asset pending — slot “${slot}”` : "Asset pending"}
        </span>
      </div>
      <figcaption className={styles.caption}>
        <span>{label}</span>
        {isExternal ? (
          <a href={url} className={styles.link} target="_blank" rel="noopener noreferrer">
            Open
            <Icon name="external-link" size={12} />
          </a>
        ) : null}
      </figcaption>
    </figure>
  );
}
