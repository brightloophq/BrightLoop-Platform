import Link from "next/link";
import type { Metadata } from "next";
import { Container, Eyebrow, Section } from "@brightloop/ui";
import { articlesNewestFirst, openingParagraph, readingMinutes } from "@/lib/blog";
import home from "../home.module.css";
import styles from "./blog.module.css";

/**
 * Writing index.
 *
 * `/blog` is one of the handful of paths every crawler and most visitors try,
 * and it 404'd. The honest fix was never an empty index or a set of invented
 * posts — it was writing something true first, which is what `lib/blog.ts`
 * holds: how we work, and practice that can be checked against any site.
 */

export const metadata: Metadata = {
  title: "Writing",
  description:
    "Articles from Auxion on diagnosing a business before quoting it, building brand, web, automation and measurement as one loop, and what lead capture really means.",
  alternates: { canonical: "/blog" },
};

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default function BlogIndexPage() {
  const articles = articlesNewestFirst();

  return (
    <Section rhythm="hero">
      <Container width="prose">
        <Eyebrow>Writing</Eyebrow>
        <h1 className={home.title}>Writing</h1>
        <p className={home.lede}>
          How we work, and what we have found to be true about small business websites. We publish
          when there is something worth writing down rather than to a schedule, so this page is
          short on purpose.
        </p>

        <ul className={styles.list}>
          {articles.map((article) => (
            <li key={article.slug} className={styles.item}>
              <Link href={`/blog/${article.slug}`} className={styles.itemLink}>
                <span className={styles.meta}>
                  <time dateTime={article.publishedAt}>
                    {DATE.format(new Date(`${article.publishedAt}T00:00:00Z`))}
                  </time>
                  <span>{readingMinutes(article)} min read</span>
                </span>
                <span className={styles.itemTitle}>{article.title}</span>
                <span className={styles.itemSummary}>{article.summary}</span>
                <span className={styles.itemStandfirst}>{openingParagraph(article)}</span>
                <span className={styles.itemMore}>Read the article</span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
