import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DISCIPLINE_SLUGS, disciplineFromSlug } from "@brightloop/schema";
import { PLACEHOLDER_DISCIPLINE_COPY } from "@brightloop/data";
import {
  Accordion,
  Button,
  CTASection,
  Card,
  Container,
  Eyebrow,
  Icon,
  Section,
} from "@brightloop/ui";
import { getCatalogRepository } from "@/lib/repositories";
import home from "../../home.module.css";
import styles from "../service-detail.module.css";

interface PageProps {
  params: Promise<{ discipline: string }>;
}

/** Pre-render all four discipline routes at build time (SSG). */
export function generateStaticParams() {
  return Object.keys(DISCIPLINE_SLUGS).map((discipline) => ({ discipline }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { discipline: slug } = await params;
  const discipline = disciplineFromSlug(slug);
  if (!discipline) return {};

  const copy = PLACEHOLDER_DISCIPLINE_COPY[discipline];
  return {
    title: discipline,
    description: copy?.blurb,
  };
}

/**
 * Service detail (handoff §05) — hero + module list + FAQ + CTA.
 *
 * Every module, price range, deliverable and impact statement is read from the
 * catalog repository. When real pricing replaces the placeholder catalog, this
 * page does not change.
 */
export default async function ServiceDetailPage({ params }: PageProps) {
  const { discipline: slug } = await params;
  const discipline = disciplineFromSlug(slug);
  if (!discipline) notFound();

  const catalog = getCatalogRepository();
  const details = await catalog.listModuleDetailsByDiscipline(discipline);

  const copy = PLACEHOLDER_DISCIPLINE_COPY[discipline];

  return (
    <>
      <Section rhythm="hero">
        <Container width="wide">
          <Link href="/services" className={styles.back}>
            <Icon name="arrow-left" size={14} />
            All services
          </Link>

          <div className={home.head}>
            <span className={styles.heroIcon}>
              <Icon name={copy?.icon ?? "sparkles"} size={24} />
            </span>
            <Eyebrow>{copy?.eyebrow ?? "Discipline"}</Eyebrow>
            <h1 className={home.title}>{copy?.outcome ?? discipline}</h1>
            <p className={home.lede}>{copy?.blurb}</p>
          </div>
        </Container>
      </Section>

      {/* ---- Modules ---- */}
      <Section rhythm="tight" inset>
        <Container width="wide">
          <div className={home.head}>
            <Eyebrow>What&apos;s included</Eyebrow>
            <h2 className={home.title}>
              {details.length} {details.length === 1 ? "module" : "modules"} in {discipline}
            </h2>
          </div>

          <div className={styles.modules}>
            {details.map(({ module, content }) => (
              <Card key={module.id} className={styles.module}>
                <div>
                  <h3 className={styles.moduleName}>{module.name}</h3>
                  {content ? <p className={styles.outcome}>{content.outcome}</p> : null}
                  <p className={styles.promise}>{content?.promise ?? module.why}</p>

                  {content && content.deliverables.length > 0 ? (
                    <ul className={styles.deliverables}>
                      {content.deliverables.map(([name, what]) => (
                        <li key={name} className={styles.deliverable}>
                          <Icon name="check" size={14} className={styles.check} />
                          <span>
                            <span className={styles.deliverableName}>{name}</span>
                            <span className={styles.deliverableWhat}>{what}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className={styles.deliverables}>
                      {module.includes.map((item) => (
                        <li key={item} className={styles.deliverable}>
                          <Icon name="check" size={14} className={styles.check} />
                          <span className={styles.deliverableName}>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {content ? (
                    <div className={styles.impact}>
                      <div>
                        <span className={styles.impactLabel}>Why it matters</span>
                        <span className={styles.impactValue}>{content.impact.value}</span>
                      </div>
                      <div>
                        <span className={styles.impactLabel}>What changes</span>
                        <span className={styles.impactValue}>{content.impact.results}</span>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Detail rail — timeline and fit, NO pricing (Sprint 5R spec §4). */}
                <aside className={styles.rail}>
                  <div className={styles.railMeta}>
                    <span className={styles.railRow}>
                      <span>Typical timeline</span>
                      <span className={styles.railRowValue}>
                        {module.weeks[0]}–{module.weeks[1]} weeks
                      </span>
                    </span>
                    {content ? (
                      <span className={styles.railRow}>
                        <span>Your involvement</span>
                        <span className={styles.railRowValue}>{content.impact.complexity}</span>
                      </span>
                    ) : null}
                    {module.deps.length > 0 ? (
                      <span className={styles.railRow}>
                        <span>Works best with</span>
                        <span className={styles.railRowValue}>{module.deps.join(", ")}</span>
                      </span>
                    ) : null}
                  </div>

                  <Button variant="secondary" size="sm" block asChild>
                    <Link href="/configurator">Add to configurator</Link>
                  </Button>
                </aside>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* ---- FAQ ---- */}
      <Section rhythm="tight" inset>
        <Container width="md">
          <div className={`${home.head} ${home.headCentered}`}>
            <Eyebrow>Questions</Eyebrow>
            <h2 className={home.title}>Common questions</h2>
          </div>

          <Accordion
            defaultOpenId="q1"
            items={[
              {
                id: "q1",
                title: "How does pricing work?",
                content: (
                  <>
                    We don&apos;t publish rate cards. After you complete the assessment and
                    configurator, a BrightLoop strategist prepares tailored pricing with you in a
                    discovery conversation — scoped to exactly what you need, with no obligation.
                  </>
                ),
              },
              {
                id: "q2",
                title: "What if I already have some of this?",
                content: (
                  <>
                    The configurator asks what you already own and removes it from the build, so you
                    are not charged for work that is already done to a good standard.
                  </>
                ),
              },
              {
                id: "q3",
                title: "Do I have to buy the whole loop?",
                content: (
                  <>
                    No. Each module stands alone. The loop is how they compound — but plenty of
                    clients start with one discipline and add the rest when it makes sense.
                  </>
                ),
              },
            ]}
          />
        </Container>
      </Section>

      <Section rhythm="tight">
        <Container width="wide">
          <CTASection
            title={`Ready to strengthen ${discipline}?`}
            body="Start with the assessment to see where this sits against the rest of your loop, or book a call and talk it through."
            actions={
              <>
                <Button variant="primary" size="lg" asChild>
                  <Link href="/assessment">Start the Health Assessment</Link>
                </Button>
                <Button variant="secondary" size="lg" asChild>
                  <Link href="/contact">Book a Strategy Call</Link>
                </Button>
              </>
            }
          />
        </Container>
      </Section>
    </>
  );
}
