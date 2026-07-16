import { Icon } from "./Icon";
import styles from "./PlaceholderNotice.module.css";

export interface PlaceholderNoticeProps {
  /** Reputation content (case studies, testimonials, ratings) is sample data. */
  reputation: boolean;
  /** Catalog content (packages, module prices, estimates) is sample data. */
  catalog: boolean;
}

/**
 * PlaceholderNotice — honest labelling of non-real content.
 *
 * Handoff integrity rule 4: "Placeholder content is labeled."
 *
 * The wording is derived from WHICH sources are still sample, not a single flag.
 * That matters: once reputation is Supabase-backed the case studies are real,
 * but every price is still placeholder pending open decisions 1 & 2. A single
 * flag would drop the label at exactly that point — real work displayed beside
 * invented prices, with nothing saying so. Each half retires independently, and
 * the bar disappears on its own when both are real. Nobody has to remember to
 * delete it.
 */
export function PlaceholderNotice({ reputation, catalog }: PlaceholderNoticeProps) {
  if (!reputation && !catalog) return null;

  let detail: string;
  if (reputation && catalog) {
    detail =
      "Case studies, testimonials, ratings and prices on this site are placeholders from the design bundle. Nothing here is real or client-approved.";
  } else if (catalog) {
    detail =
      "Package names, prices and estimates on this site are placeholders pending real pricing. Case studies and reviews are live content.";
  } else {
    detail =
      "Case studies, testimonials and ratings on this site are placeholders from the design bundle and are not client-approved.";
  }

  return (
    <div className={styles.bar} role="note">
      <Icon name="lightbulb" size={14} />
      <span className={styles.text}>
        Preview — sample content. <span className={styles.detail}>{detail}</span>
      </span>
    </div>
  );
}
