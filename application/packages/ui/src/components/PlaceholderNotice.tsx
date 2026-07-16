import { Icon } from "./Icon";
import styles from "./PlaceholderNotice.module.css";

export interface PlaceholderNoticeProps {
  /** Render nothing when the bound data source is real. */
  active: boolean;
}

/**
 * PlaceholderNotice — honest labelling of non-real content.
 *
 * Handoff integrity rule 4: "Placeholder content is labeled." Every case study,
 * testimonial, rating, company name and price currently on the public surface is
 * sample copy from the design bundle, and none of it is client-approved.
 *
 * This is driven by the repository's `source`, not a hardcoded flag — the moment
 * a real data source is bound, the notice disappears on its own. It is not a
 * substitute for the pre-launch checklist in
 * docs/handoff/13-assets-and-placeholders.md.
 */
export function PlaceholderNotice({ active }: PlaceholderNoticeProps) {
  if (!active) return null;

  return (
    <div className={styles.bar} role="note">
      <Icon name="lightbulb" size={14} />
      <span className={styles.text}>
        Preview — sample content.{" "}
        <span className={styles.detail}>
          Case studies, testimonials, ratings and prices on this site are placeholders from the design
          bundle. Nothing here is real or client-approved.
        </span>
      </span>
    </div>
  );
}
