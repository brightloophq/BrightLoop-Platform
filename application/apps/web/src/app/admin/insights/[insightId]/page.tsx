import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AuthorizationError,
  assertInsightsRead,
  canWriteInsights,
  buildInsightDetailView,
  insightStatusLabel,
} from "@brightloop/domain";
import { signalStatusLabel } from "@brightloop/domain";
import {
  ActivityTimeline,
  Alert,
  Badge,
  ConfidenceMeter,
  DetailField,
  DetailGrid,
  EmptyWorkspace,
  Icon,
  OperationalPanel,
  SectionHeader,
  type TimelineItem,
} from "@brightloop/ui";
import { MotionProvider, PageTransition } from "@brightloop/ui/motion";
import { requireSurface } from "@/lib/auth";
import { getInsightsRepository } from "@/lib/repositories";
import { InsightActions } from "../InsightActions";
import styles from "../insights.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Insight · Auxion" };

interface PageProps {
  params: Promise<{ insightId: string }>;
  searchParams: Promise<{ created?: string }>;
}

export default async function InsightDetailPage({ params, searchParams }: PageProps) {
  const actor = await requireSurface("admin");
  try {
    assertInsightsRead(actor);
  } catch (err) {
    if (err instanceof AuthorizationError) return <Unauthorized />;
    throw err;
  }

  const { insightId } = await params;
  const { created } = await searchParams;

  const repo = await getInsightsRepository();
  const data = await repo.getById(insightId);
  if (!data) notFound();

  const canWrite = canWriteInsights(actor);
  const view = buildInsightDetailView(data, canWrite);
  const insight = view.insight;

  const timeline: TimelineItem[] = view.timeline.map((e, i) => ({
    id: `${i}-${e.at}`,
    title: e.kind === "created" ? "Insight created" : `${insightStatusLabel(e.from ?? "")} → ${e.toLabel}`,
    meta: [e.actorName ?? "system", e.reason].filter(Boolean).join(" · "),
    at: e.at,
    timeLabel: formatDateTime(e.at),
    emphasis: e.kind === "transition",
  }));

  return (
    <div className={styles.page}>
      <MotionProvider>
        <PageTransition className={styles.canvas}>
          <Link href="/admin/insights" className={styles.backLink}>
            <Icon name="arrow-left" size={16} /> Back to insights
          </Link>

          {created === "1" ? (
            <Alert tone="success" title="Insight created">
              It's in the Generated state. Endorse or dismiss it from the actions below.
            </Alert>
          ) : null}

          <div className={styles.detailHead}>
            <div className={styles.detailTitleWrap}>
              <span className={styles.detailKicker}>Insight · {view.orgName}</span>
              <h1 className={styles.detailTitle}>{insight.summary}</h1>
              <div>
                <Badge status={insight.status}>{view.statusLabel}</Badge>
                {view.isTerminal ? (
                  <span className={styles.terminalNote}>
                    {insight.status === "endorsed" ? "Endorsed — closed" : "Dismissed — closed"}
                  </span>
                ) : null}
              </div>
            </div>
            {canWrite ? <InsightActions id={insight.id} actions={view.actions} /> : null}
          </div>

          <OperationalPanel>
            <SectionHeader
              title="Originating signal"
              hint="An insight interprets a signal — the evidence it derives from (Signal → Insight)."
            />
            <Link href={view.signalHref} className={styles.signalCard}>
              <div className={styles.signalCardMain}>
                <span className={styles.signalCardKicker}>Signal</span>
                <span className={styles.signalCardTitle}>{view.signalTitle}</span>
              </div>
              <div>
                {view.signalStatus ? (
                  <Badge status={view.signalStatus}>{signalStatusLabel(view.signalStatus)}</Badge>
                ) : null}
                <Icon name="arrow-right" size={16} className={styles.muted} />
              </div>
            </Link>
          </OperationalPanel>

          <OperationalPanel>
            <SectionHeader title="Details" />
            <DetailGrid>
              <DetailField label="Status">
                <Badge status={insight.status}>{view.statusLabel}</Badge>
              </DetailField>
              <DetailField label="Confidence">
                <ConfidenceMeter
                  percent={view.confidencePercent}
                  band={view.confidenceBand}
                  bandLabel={view.confidenceBandLabel}
                  size="md"
                />
              </DetailField>
              <DetailField label="Organization">{view.orgName}</DetailField>
              <DetailField label="Created by">{view.createdByName ?? "System"}</DetailField>
              <DetailField label="Created">
                <time dateTime={insight.createdAt}>{formatDateTime(insight.createdAt)}</time>
              </DetailField>
              <DetailField label="Insight ID">
                <span className={styles.mono}>{insight.id}</span>
              </DetailField>
              <DetailField label="Interpretation" wide>
                {insight.detail ? insight.detail : <span className={styles.muted}>No detail provided.</span>}
              </DetailField>
              <DetailField label="Evidence" wide>
                {insight.evidence.length === 0 ? (
                  <span className={styles.muted}>No evidence attached.</span>
                ) : (
                  <ul className={styles.evidenceList}>
                    {insight.evidence.map((ev, i) => (
                      <li key={i} className={styles.evidenceItem}>
                        <span className={styles.evidenceKind}>{ev.kind}</span>
                        <span>{ev.label ?? ev.ref}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </DetailField>
            </DetailGrid>
          </OperationalPanel>

          <OperationalPanel>
            <SectionHeader title="History" hint="The insight's lifecycle, newest first — from the append-only audit trail." />
            <ActivityTimeline items={timeline} empty={<p className={styles.muted}>No history yet.</p>} />
          </OperationalPanel>
        </PageTransition>
      </MotionProvider>
    </div>
  );
}

function Unauthorized() {
  return (
    <div className={styles.page}>
      <div className={styles.canvas}>
        <OperationalPanel>
          <EmptyWorkspace
            icon="lock"
            title="You don't have access to this insight"
            body="Your role can't view the transformation command center."
          />
        </OperationalPanel>
      </div>
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
