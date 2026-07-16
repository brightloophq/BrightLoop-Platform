import type { Metadata } from "next";
import { PUBLISH, type PublishStatus } from "@brightloop/schema";
import { Alert, Badge, Card, EmptyState, Stars } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import { toPortfolioProject, toTestimonial } from "@brightloop/data";
import { ModerationControls } from "./ModerationControls";
import { NewTestimonialForm } from "./NewTestimonialForm";
import styles from "../cms.module.css";
import shell from "../admin.module.css";

export const metadata: Metadata = { title: "Reviews" };

/** Admin data must never be cached — drafts change and are per-role. */
export const dynamic = "force-dynamic";

/**
 * Reputation CMS → Reviews (handoff §08).
 *
 * Unlike the public site, this reads through the SESSION client so RLS gives an
 * internal role the `*_internal_read` policy — i.e. drafts and private rows too.
 * The public anon client cannot see these, which is the whole point.
 *
 * This is where real, client-consented testimonials are entered and moderated.
 * The rule the CMS enforces: you record what a client said and control whether
 * it is published — you never author it.
 */
export default async function ReviewsPage() {
  const supabase = await createClient();

  const [{ data: tRows, error: tErr }, { data: pRows }] = await Promise.all([
    supabase.from("testimonials").select("*").order("created_at", { ascending: false }),
    supabase.from("portfolio_projects").select("*"),
  ]);

  const testimonials = (tRows ?? []).map(toTestimonial);
  const projectSlugs = (pRows ?? []).map(toPortfolioProject).map((p) => p.slug);

  const live = testimonials.filter((t) => PUBLISH[t.publish].public).length;

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>Reviews</h1>
      </div>

      <div className={shell.content}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Testimonials</h2>
            <p className={styles.lede}>
              {testimonials.length} total · {live} live on the public site. Only{" "}
              <strong>Public</strong> and <strong>Featured</strong> reviews appear publicly or count
              toward the aggregate rating.
            </p>
          </div>
          <NewTestimonialForm projectSlugs={projectSlugs} />
        </div>

        {tErr ? (
          <div className={styles.notice}>
            <Alert tone="danger" title="Couldn't load reviews">
              {tErr.message}. If this says permission denied, the custom access token hook may not be
              registered — your JWT would carry no role and every policy denies.
            </Alert>
          </div>
        ) : null}

        <div className={styles.notice}>
          <Alert tone="info" title="Before you publish a review" icon="lock">
            It must be a real client&apos;s own words, attributed to them, and they must have agreed
            to it being published with their name and company. Everything you enter starts as a
            draft.
          </Alert>
        </div>

        {testimonials.length === 0 ? (
          <EmptyState
            icon="heart"
            title="No reviews yet"
            body="Add a testimonial to get started. It saves as a draft — you decide when it goes public."
          />
        ) : (
          <div className={styles.rows}>
            {testimonials.map((t) => {
              const meta = PUBLISH[t.publish as PublishStatus];
              return (
                <Card
                  key={t.id}
                  className={[styles.row, meta.public ? styles.rowLive : null]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className={styles.rowBody}>
                    <div className={styles.rowTop}>
                      <Stars value={t.overall} size={13} />
                      <span className={styles.rowName}>{t.author}</span>
                      <span className={styles.rowMeta}>
                        {t.role ? `${t.role}, ` : ""}
                        {t.company}
                      </span>
                      <Badge tone={meta.public ? "success" : "warning"} dot>
                        {meta.label}
                      </Badge>
                      {t.pinned ? <Badge tone="cyan">Pinned</Badge> : null}
                      {t.featuredOnHome ? <Badge tone="cyan">Home</Badge> : null}
                    </div>
                    <p className={styles.quote}>“{t.quote}”</p>
                    {t.projectSlug ? (
                      <p className={styles.rowMeta} style={{ marginTop: "var(--space-2)" }}>
                        Linked to {t.projectSlug}
                      </p>
                    ) : null}
                  </div>

                  <ModerationControls
                    kind="testimonial"
                    id={t.id}
                    publish={t.publish}
                    pinned={t.pinned}
                    featuredOnHome={t.featuredOnHome}
                    showPin
                  />
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
