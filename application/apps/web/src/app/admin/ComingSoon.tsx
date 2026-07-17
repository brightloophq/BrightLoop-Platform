import { EmptyState } from "@brightloop/ui";
import { PageTransition } from "@brightloop/ui/motion";
import styles from "./coming-soon.module.css";

/**
 * Placeholder for a transformation section that isn't built yet. A real, framed
 * page (not a dead link or a 404) so the product's shape is navigable — with a
 * subtle GSAP page-enter that snaps under reduced motion.
 */
export function ComingSoon({
  title,
  description,
  icon = "sparkles",
}: {
  title: string;
  description: string;
  icon?: string;
}) {
  return (
    <PageTransition className={styles.wrap}>
      <header className={styles.head}>
        <span className={styles.eyebrow}>Transformation</span>
        <h1 className={styles.title}>{title}</h1>
      </header>
      <div className={styles.card}>
        <EmptyState icon={icon} title={`${title} is coming soon`} body={description} />
      </div>
    </PageTransition>
  );
}
