import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Button, CTASection, Container, Eyebrow, Section } from "@brightloop/ui";
import { ARTICLES, articleBySlug, readingMinutes, type Article } from "@/lib/blog";
import { safeJsonLd } from "@/lib/json-ld";
import { SITE_NAME, absoluteUrl, siteOrigin } from "@/lib/site";
import home from "../../home.module.css";
import styles from "../blog.module.css";

interface PageProps {
  params: Promise<{ slug: string }>;
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

export function generateStaticParams(): { slug: string }[] {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = articleBySlug(slug);
  if (!article) return {};

  return {
    title: article.title,
    description: article.summary,
    alternates: { canonical: `/blog/${article.slug}` },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.summary,
      publishedTime: article.publishedAt,
      url: `/blog/${article.slug}`,
    },
  };
}

/**
 * Article JSON-LD.
 *
 * `author` and `publisher` are the organization, not a person: nobody is
 * credited by name on these pages, and inventing a byline to satisfy a schema
 * validator would be asserting a person wrote something they did not.
 */
function articleSchema(article: Article): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.summary,
    datePublished: article.publishedAt,
    dateModified: article.publishedAt,
    inLanguage: "en",
    mainEntityOfPage: { "@type": "WebPage", "@id": absoluteUrl(`/blog/${article.slug}`) },
    author: { "@id": `${siteOrigin()}/#organization`, name: SITE_NAME },
    publisher: { "@id": `${siteOrigin()}/#organization`, name: SITE_NAME },
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = articleBySlug(slug);
  if (!article) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(articleSchema(article)) }}
      />

      <Section rhythm="hero">
        <Container width="prose">
          <Eyebrow>Writing</Eyebrow>
          <h1 className={home.title}>{article.title}</h1>
          <p className={home.lede}>{article.summary}</p>
          <p className={styles.articleMeta}>
            <time dateTime={article.publishedAt}>
              {DATE.format(new Date(`${article.publishedAt}T00:00:00Z`))}
            </time>
            <span>{readingMinutes(article)} min read</span>
            <span>{article.audience}</span>
          </p>
        </Container>
      </Section>

      <Section inset>
        <Container width="prose">
          <div className={styles.prose}>
            {article.body.map((block, i) => {
              if (block.kind === "heading") {
                return (
                  <h2 key={i} className={styles.heading}>
                    {block.text}
                  </h2>
                );
              }
              if (block.kind === "list") {
                return (
                  <ul key={i} className={styles.bullets}>
                    {(block.items ?? []).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                );
              }
              return (
                <p key={i} className={styles.paragraph}>
                  {block.text}
                </p>
              );
            })}
          </div>

          <div className={styles.footerNav}>
            <Button variant="ghost" size="md" asChild>
              <Link href="/blog">All writing</Link>
            </Button>
          </div>
        </Container>
      </Section>

      <CTASection
        eyebrow="Start here"
        title="Want this looked at on your own site?"
        body="Tell us the problem and we will scan what exists now, then say what we would actually do about it."
        actions={
          <>
            <Button variant="primary" size="lg" asChild>
              <Link href="/contact">Request a consultation</Link>
            </Button>
            <Button variant="secondary" size="lg" asChild>
              <Link href="/start">Run a free business scan</Link>
            </Button>
          </>
        }
      />
    </>
  );
}
