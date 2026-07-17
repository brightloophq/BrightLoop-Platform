import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { canonicalUrl } from "@brightloop/domain";
import { getReputationRepository } from "@/lib/repositories";
import { CaseStudyView } from "../../portfolio/CaseStudyView";

/** ISR, 5 min — see /portfolio/[slug]; same record, same staleness risk. */
export const revalidate = 300;
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * /case-studies/:slug — the long-form view of the SAME project record.
 *
 * Open decision 6 asks whether these are distinct long-form pages or a richer
 * view of one record. The prototype treats them as one record, so this route
 * renders the same project and **canonicalises to /portfolio/:slug**. That way
 * the two URLs never compete in search, and if the decision later splits them
 * into genuinely different content, only the canonical changes.
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
  if (!project) return {};

  return {
    title: project.seo.title || project.name,
    description: project.seo.description || project.summary,
    // Points at /portfolio/:slug, NOT at this URL — one canonical per record.
    alternates: { canonical: canonicalUrl("portfolio", project.slug) },
    openGraph: {
      type: "article",
      title: project.seo.title || project.name,
      description: project.seo.description || project.summary,
      url: canonicalUrl("portfolio", project.slug),
      siteName: "Auxion",
    },
  };
}

export default async function LongFormCaseStudyPage({ params }: PageProps) {
  const { slug } = await params;
  const repo = await getReputationRepository();

  const project = await repo.getProjectBySlug(slug);
  if (!project) notFound();

  const [testimonial, related] = await Promise.all([
    repo.getTestimonialForProject(slug),
    repo.listRelatedProjects(slug, 3),
  ]);

  return (
    <CaseStudyView project={project} testimonial={testimonial} related={related} variant="case" />
  );
}
