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
  /** Rendered as "© {year} BrightLoop". Passed in so the component stays pure. */
  year: number;
}

export function Footer({ columns, legal, tagline, year }: FooterProps) {
  return (
    <footer className={styles.footer}>
      <Container width="wide">
        <div className={styles.top}>
          <div className={styles.brandCol}>
            <Logo variant="lockup" height={26} />
            <p className={styles.tagline}>{tagline}</p>
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
          <p className={styles.copy}>© {year} BrightLoop. Brands. Systems. Growth.</p>
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
