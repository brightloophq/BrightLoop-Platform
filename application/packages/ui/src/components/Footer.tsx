import Link from "next/link";
import { Container } from "./Container";
import { Logo } from "./Logo";
import styles from "./Footer.module.css";

export interface FooterColumn {
  title: string;
  links: readonly { label: string; href: string }[];
}

export interface FooterProps {
  columns: readonly FooterColumn[];
  legal: readonly { label: string; href: string }[];
  tagline: string;
  /** Rendered as "© {year} Auxion". Passed in so the component stays pure. */
  year: number;
  /**
   * Published contact address, rendered as a `mailto:` beside the tagline.
   *
   * It belongs in the footer rather than only on /contact: a visitor deciding
   * whether to get in touch should not have to navigate to find out how, and a
   * reachable address on every page is the plainest signal a site gives that a
   * real business is behind it.
   */
  contactEmail?: string;
  /** Public profiles. Renders nothing when none have been declared. */
  social?: readonly { label: string; href: string }[];
}

export function Footer({ columns, legal, tagline, year, contactEmail, social = [] }: FooterProps) {
  return (
    <footer className={styles.footer} data-theme="dark">
      <Container width="wide">
        <div className={styles.top}>
          <div className={styles.brandCol}>
            <Logo variant="lockup" height={26} />
            <p className={styles.tagline}>{tagline}</p>
            {contactEmail ? (
              <a href={`mailto:${contactEmail}`} className={styles.contact}>
                {contactEmail}
              </a>
            ) : null}
            {social.length > 0 ? (
              <ul className={styles.social} aria-label="Auxion on other platforms">
                {social.map((profile) => (
                  <li key={profile.href}>
                    <a
                      href={profile.href}
                      className={styles.link}
                      target="_blank"
                      rel="noopener noreferrer me"
                    >
                      {profile.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className={styles.colTitle}>{col.title}</h2>
              <ul className={styles.list}>
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={styles.link}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className={styles.bottom}>
          <p className={styles.copy}>© {year} Auxion. Brands. Systems. Growth.</p>
          <div className={styles.legal}>
            {legal.map((link) => (
              <Link key={link.href} href={link.href} className={styles.link}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </Container>
    </footer>
  );
}
