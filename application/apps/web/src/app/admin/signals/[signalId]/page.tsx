import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AuthorizationError,
  assertSignalsRead,
  canWriteSignals,
  buildSignalDetailView,
  signalStatusLabel,
} from "@brightloop/domain";
import {
  ActivityTimeline,
  Alert,
  Badge,
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
import { getSignalsRepository } from "@/lib/repositories";
import { SignalActions } from "../SignalActions";
import styles from "../signals.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Signal · Auxion" };

interface PageProps {
  params: Promise<{ signalId: string }>;
  searchParams: Promise<{ created?: string }>;
}

export default async function SignalDetailPage({ params, searchParams }: PageProps) {
  const actor = await requireSurface("admin");
  try {
    assertSignalsRead(actor);
  } catch (err) {
    if (err instanceof AuthorizationError) return <Unauthorized />;
    throw err;
  }

  const { signalId } = await params;
  const { created } = await searchParams;

  const repo = await getSignalsRepository();
  const data = await repo.getById(signalId);
  if (!data) notFound();

  const canWrite = canWriteSignals(actor);
  const view = buildSignalDetailView(data, canWrite);
  const signal = view.signal;

  const timeline: TimelineItem[] = view.timeline.map((e, i) => ({
    id: `${i}-${e.at}`,
    title: e.kind === "created" ? "Signal created" : `${signalStatusLabel(e.from ?? "")} → ${e.toLabel}`,
    meta: [e.actorName ?? "system", e.reason].filter(Boolean).join(" · "),
    at: e.at,
    timeLabel: formatDateTime(e.at),
    emphasis: e.kind === "transition",
  }));

  return (
    <div className={styles.page}>
      <MotionProvider>
        <PageTransition className={styles.canvas}>
          <Link href="/admin/signals" className={styles.backLink}>
            <Icon name="arrow-left" size={16} /> Back to signals
          </Link>

          {created === "1" ? (
            <Alert tone="success" title="Signal created">
              It's in the Detected state. Validate or prioritize it from the actions below.
            </Alert>
          ) : null}

          <div className={styles.detailHead}>
            <div className={styles.detailTitleWrap}>
              <span className={styles.detailKicker}>Signal · {view.orgName}</span>
              <h1 className={styles.detailTitle}>{signal.title}</h1>
              <div>
                <Badge status={signal.status}>{view.statusLabel}</Badge>
                {view.isTerminal ? <span className={styles.terminalNote}>Archived — closed</span> : null}
              </div>
            </div>
            {canWrite ? <SignalActions id={signal.id} actions={view.actions} /> : null}
          </div>

          <OperationalPanel>
            <SectionHeader title="Details" />
            <DetailGrid>
              <DetailField label="Status">
                <Badge status={signal.status}>{view.statusLabel}</Badge>
              </DetailField>
              <DetailField label="Organization">{view.orgName}</DetailField>
              <DetailField label="Source">{signal.sourceRef ?? "—"}</DetailField>
              <DetailField label="Created by">{view.createdByName ?? "System"}</DetailField>
              <DetailField label="Created">
                <time dateTime={signal.createdAt}>{formatDateTime(signal.createdAt)}</time>
              </DetailField>
              <DetailField label="Signal ID">
                <span className={styles.mono}>{signal.id}</span>
              </DetailField>
              <DetailField label="Description" wide>
                {signal.detail ? signal.detail : <span className={styles.muted}>No description provided.</span>}
              </DetailField>
              <DetailField label="Evidence" wide>
                {signal.evidence.length === 0 ? (
                  <span className={styles.muted}>No evidence attached.</span>
                ) : (
                  <ul className={styles.evidenceList}>
                    {signal.evidence.map((ev, i) => (
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
            <SectionHeader title="History" hint="The signal's lifecycle, newest first — from the append-only audit trail." />
            <ActivityTimeline
              items={timeline}
              empty={<p className={styles.muted}>No history yet.</p>}
            />
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
            title="You don't have access to this signal"
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
