import Link from "next/link";
import type { PortfolioProject } from "@brightloop/schema";
import { Stars, Tag } from "@brightloop/ui";
import { firstUsableImage } from "@/lib/project-image";
import styles from "./portfolio.module.css";

export interface WorkTileProps {
  project: PortfolioProject;
  /** 1-based position in the index, shown as the tile's numeral. */
  position: number;
  /** Rating of the project's linked PUBLISHED testimonial, when one exists. */
  rating?: number;
  awards?: readonly string[];
}

/**
 * WorkTile — one client engagement on the Work index.
 *
 * A client index, not a card grid: the work is the page, so each tile gives the
 * image band most of its height and the words sit underneath as a caption —
 * numeral, client, disciplines, year. The summary is held back until hover or
 * focus so a reader scanning ten clients reads ten names, not ten paragraphs.
 *
 * INTEGRITY, unchanged from ProjectCard: the tile shows project FACTS and, when
 * a published testimonial is linked, its rating. There is no prop for a business
 * result — result metrics live only on the case-study Results panel behind
 * `disclosedMetrics()`.
 *
 * ACCESSIBILITY: exactly one link per tile, wrapping everything, so the whole
 * tile is one large hit target with one accessible name. The hover copy is in
 * the DOM unconditionally (opacity, not `display`), so it is available to screen
 * readers and revealed by `:focus-within` for keyboard users — the reveal is
 * decoration, never the only route to the content.
 */
export function WorkTile({ project, position, rating, awards = [] }: WorkTileProps) {
  const hero = firstUsableImage(project.media);
  // Industry plus at most three disciplines. An Enterprise engagement carries
  // nine services; listing them all turns a one-line caption into a paragraph
  // and buries the client's name, which is the thing being shown.
  const shown = project.services.slice(0, 3);
  const remainder = project.services.length - shown.length;
  const disciplines = [
    project.industry,
    ...shown,
    ...(remainder > 0 ? [`+${remainder} more`] : []),
  ].join(" · ");

  return (
    <Link href={`/portfolio/${project.slug}`} className={styles.tile}>
      <span className={styles.tileMedia}>
        {hero ? (
          /*
           * A plain <img>, deliberately. Media URLs come from the Reputation CMS
           * and can point at any storage host, which `next/image` would require
           * us to enumerate in `images.remotePatterns` ahead of time — a config
           * change every time the client's asset host changes. The CSP already
           * constrains this (`img-src 'self' data: blob: https:`), the aspect
           * ratio is fixed by the container so there is no layout shift, and the
           * URL reached `resolveEmbed`'s https + extension gate to get here.
           */
          <img
            className={styles.tileImage}
            src={hero.src}
            alt={hero.label ? `${project.client} — ${hero.label}` : project.client}
            loading="lazy"
            decoding="async"
          />
        ) : (
          /* No photography supplied yet. Rather than an apology, the tile draws
             the client's monogram on the brand's gold field — a designed plate
             that stands on its own, and that a real image simply replaces. */
          <span className={styles.tileMonogram} aria-hidden="true">
            {monogram(project.client)}
          </span>
        )}

        <span className={styles.tileVeil}>
          <span className={styles.tileSummary}>{project.summary}</span>
          <span className={styles.tileCta}>
            View case study
            <span className={styles.tileArrow} aria-hidden="true">
              →
            </span>
          </span>
        </span>

        {awards.length > 0 ? (
          <span className={styles.tileAwards}>
            {awards.map((award) => (
              <Tag key={award} accent>
                {award}
              </Tag>
            ))}
          </span>
        ) : null}
      </span>

      <span className={styles.tileCaption}>
        <span className={styles.tileIndex} aria-hidden="true">
          {String(position).padStart(2, "0")}
        </span>

        <span className={styles.tileIdent}>
          <span className={styles.tileName}>{project.client}</span>
          <span className={styles.tileDisciplines}>{disciplines}</span>
        </span>

        <span className={styles.tileMeta}>
          <span className={styles.tileYear}>{project.year}</span>
          {/* showValue, because an unlabelled rail beside a year reads as a
              stray rule rather than a rating. */}
          {typeof rating === "number" ? <Stars value={rating} size={13} showValue /> : null}
        </span>
      </span>
    </Link>
  );
}

/** One or two letters from the client name — "Harbor & Co" → "HC". */
function monogram(client: string): string {
  const words = client
    .split(/[\s&]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length > 0);

  const initials = words.slice(0, 2).map((w) => w[0]!.toUpperCase());
  return initials.length > 0 ? initials.join("") : "—";
}
