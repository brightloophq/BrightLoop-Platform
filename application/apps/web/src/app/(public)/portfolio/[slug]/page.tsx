import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { canonicalUrl } from "@brightloop/domain";
import { getReputationRepository } from "@/lib/repositories";
import { CaseStudyView } from "../CaseStudyView";

/**
 * ISR, 5 min. Without this, a case study published in the CMS never appears —
 * and a slug requested before publication stays cached as a 404 forever.
 * Literal, not imported: Next requires segment config to be statically
 * analysable. Policy: lib/revalidate.ts.
 */
export const revalidate = 300;

/** Slugs published after the last build are rendered on demand, then cached. */
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Pre-render every PUBLISHED project at build time.
 * listPublishedSlugs() is publish-gated, so an unpublished project never gets a
 * static page generated for it.
 */
export async function generateStaticParams() {
  const repo = await getReputationRepository();
  const slugs = await repo.listPublishedSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const repo = await getReputationRepository();
  const project = await repo.getProjectBySlug(slug);
  // Unpublished/missing → no metadata; the page 404s below.
  if (!project) return {};

  const url = canonicalUrl("portfolio", project.slug);

  return {
    title: project.seo.title || project.name,
    description: project.seo.description || project.summary,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: project.seo.title || project.name,
      description: project.seo.description || project.summary,
      url,
      siteName: "BrightLoop",
      // og:image intentionally omitted — the real asset for `seo.ogImage`
      // ("${project.seo.ogImage}") does not exist yet. A broken OG image is
      // worse than none; wired in the media sprint (open decision 21 / §13).
    },
    twitter: {
      card: "summary_large_image",
      title: project.seo.title || project.name,
      description: project.seo.description || project.summary,
    },
  };
}

/** Case study — canonical variant (handoff §05). */
export default async function ProjectCaseStudyPage({ params }: PageProps) {
  const { slug } = await params;
  const repo = await getReputationRepository();

  // Publish-gated: an unpublished slug is indistinguishable from a missing one.
  const project = await repo.getProjectBySlug(slug);
  if (!project) notFound();

  const [testimonial, related] = await Promise.all([
    repo.getTestimonialForProject(slug),
    repo.listRelatedProjects(slug, 3),
  ]);

  return (
    <CaseStudyView
      project={project}
      testimonial={testimonial}
      related={related}
      variant="portfolio"
    />
  );
}
