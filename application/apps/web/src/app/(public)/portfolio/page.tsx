import Link from "next/link";
import type { Metadata } from "next";
import { AWARDS, type AwardKey } from "@brightloop/schema";
import { Button, Container, Eyebrow, EmptyState, Pagination, ProjectCard, Section } from "@brightloop/ui";
import { getReputationRepository } from "@/lib/repositories";
import {
  PER_PAGE,
  parsePortfolioParams,
  portfolioHref,
  type RawSearchParams,
} from "@/lib/portfolio-params";
import { PortfolioControls } from "./PortfolioControls";
import home from "../home.module.css";
import styles from "./portfolio.module.css";

export const metadata: Metadata = {
  title: "Work",
  description:
    "Selected Auxion projects — brand, website, automation and growth work for small businesses.",
  alternates: { canonical: "/portfolio" },
};

interface PageProps {
  searchParams: Promise<RawSearchParams>;
}

/**
 * Portfolio index (handoff §05).
 *
 * Server-rendered on every request from URL state, so it is deep-linkable and
 * crawlable. The repository publish-gates before any filter runs — no query
 * string can surface a draft or private project.
 */
export default async function PortfolioPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const state = parsePortfolioParams(params);

  const repo = await getReputationRepository();
  const [page, counts] = await Promise.all([
    repo.listProjects({
      filters: state.filters,
      search: state.search,
      sort: state.sort,
      page: state.page,
      perPage: PER_PAGE,
    }),
    repo.getFacetCounts(state.filters, state.search),
  ]);

  // Ratings come from each project's linked PUBLISHED testimonial, so an
  // unapproved review can never contribute a star rating to the grid.
  const ratings = await Promise.all(
    page.items.map(async (p) => (await repo.getTestimonialForProject(p.slug))?.overall),
  );

  const hasFilters = Object.keys(state.filters).length > 0 || state.search.length > 0;

  return (
    <Section rhythm="hero">
      <Container width="wide">
        <div className={home.head}>
          <Eyebrow>Work</Eyebrow>
          <h1 className={home.title}>Success stories</h1>
          <p className={home.lede}>
            Real projects for real small businesses. Every case study below is published with the
            client&apos;s permission — and where results aren&apos;t shown, it&apos;s because they
            asked us to keep them private.
          </p>
        </div>

        <h2 className="sr-only">Case studies</h2>
        <PortfolioControls state={state} counts={counts} total={page.total}>
          {page.items.length > 0 ? (
            <>
              <div className={styles.grid}>
                {page.items.map((project, i) => (
                  <ProjectCard
                    key={project.slug}
                    name={project.name}
                    summary={project.summary}
                    industry={project.industry}
                    services={project.services}
                    href={`/portfolio/${project.slug}`}
                    year={project.year}
                    timeline={project.timeline}
                    awards={project.awards.flatMap((a) => {
                      const label = AWARDS[a as AwardKey]?.label;
                      return label ? [label] : [];
                    })}
                    rating={ratings[i]}
                  />
                ))}
              </div>

              <Pagination
                page={page.page}
                pages={page.pages}
                hrefFor={(p) => portfolioHref({ ...state, page: p })}
              />
            </>
          ) : (
            <EmptyState
              icon="search"
              title={hasFilters ? "No projects match those filters" : "No published projects yet"}
              body={
                hasFilters
                  ? "Try removing a filter or broadening your search."
                  : "Work appears here once a project is published in the Reputation CMS. Nothing is shown until it is real and client-approved."
              }
              action={
                hasFilters ? (
                  <Button variant="secondary" size="md" asChild>
                    <Link href="/portfolio">Clear filters</Link>
                  </Button>
                ) : undefined
              }
            />
          )}
        </PortfolioControls>
      </Container>
    </Section>
  );
}
