import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizationError, assertCapability } from "@brightloop/domain";
import { isApplicationError } from "@brightloop/application";
import { Alert, Button, EmptyWorkspace, OperationalPanel, SectionHeader, SkeletonBlock } from "@brightloop/ui";
import { MotionProvider } from "@brightloop/ui/motion";
import { requireSurface } from "@/lib/auth";
import { loadScanWorkspace } from "@/lib/scanner-data";
import { buildTimelineRows } from "@/lib/prospect-scanner";
import { ScanHeader } from "../components/ScanHeader";
import { ScanControls } from "../components/ScanControls";
import { StageReadiness } from "../components/StageReadiness";
import { DiscoverySummary } from "../components/DiscoverySummary";
import { PageEvidenceTable } from "../components/PageEvidenceTable";
import { EvidenceCoverage } from "../components/EvidenceCoverage";
import { ReasoningReadiness } from "../components/ReasoningReadiness";
import { RuntimeTimeline } from "../components/RuntimeTimeline";
import { InternalReportView, ProposalReview } from "../components/StructuredArtifactView";
import { CompetitorIntelligencePanel } from "../components/CompetitorIntelligencePanel";
import { ProposalIntelligencePanel } from "../components/ProposalIntelligencePanel";
import { NarrativePanel } from "../components/NarrativePanel";
import { ProspectSummary } from "../components/ProspectSummary";
import { assessProspectForm, cancelProspectScanForm, retryProspectScanForm } from "../scanner-actions";
import styles from "../scanner.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prospect scan · Auxion" };

const SCANNER_CAP = "transformation.scan.write";

/**
 * Internal Prospect Scanner — one scan workspace (Phase C · Sprint C4).
 *
 * Server-rendered from C1 use-cases. State refreshes when the operator acts —
 * there is no polling loop, no interval and no socket; a turn is only ever taken
 * by an explicit click.
 */
export default async function ProspectScanWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireSurface("admin");
  try {
    assertCapability(actor, SCANNER_CAP);
  } catch (error) {
    if (error instanceof AuthorizationError) return <Unauthorized />;
    throw error;
  }

  const { id } = await params;
  const sp = await searchParams;
  const actionError = typeof sp["actionError"] === "string" ? sp["actionError"] : null;

  return (
    <div className={styles.page}>
      <MotionProvider>
        <div className={styles.canvas}>
          <Suspense fallback={<WorkspaceSkeleton />}>
            <Workspace runId={id} actionError={actionError} />
          </Suspense>
        </div>
      </MotionProvider>
    </div>
  );
}

async function Workspace({ runId, actionError }: { runId: string; actionError: string | null }) {
  let data: Awaited<ReturnType<typeof loadScanWorkspace>>;
  try {
    data = await loadScanWorkspace(runId);
  } catch (error) {
    if (isApplicationError(error) && error.status === 404) notFound();
    return (
      <OperationalPanel>
        <Alert tone="danger" title="We couldn't load this scan">
          Something went wrong reading the run. <Link href="/admin/prospect-scanner">Back to the scanner</Link>.
        </Alert>
      </OperationalPanel>
    );
  }
  if (data === null) notFound();

  const { scan, identity, flags, next, discovery, evidence, report, proposal, readiness, summary, competitor, proposalIntelligence, narrative, timeline, reportReviewRequired, canAssess } = data;
  const rows = buildTimelineRows(timeline);
  const latestEvent = rows[0]?.type ?? null;

  const canCancel = scan.lifecycle === "pending" || scan.lifecycle === "running" || scan.lifecycle === "blocked";
  const canRetry = scan.lifecycle === "failed" || scan.lifecycle === "blocked";

  return (
    <>
      <SectionHeader
        as="h1"
        size="page"
        index="01"
        kicker={<Link href="/admin/prospect-scanner">← Prospect Scanner</Link>}
        title={identity.businessName ?? identity.websiteUrl ?? "Prospect scan"}
        hint="Advance the pipeline one stage at a time and inspect the evidence behind every result."
      />

      {actionError ? (
        <Alert tone="danger" title="That action didn't complete">
          {actionError}
        </Alert>
      ) : null}

      {scan.lifecycle === "cancelled" ? (
        <Alert tone="neutral" title="This scan was cancelled">
          No further stage will run. Create a new scan to continue investigating this prospect.
        </Alert>
      ) : null}
      {scan.lifecycle === "failed" ? (
        <Alert tone="danger" title="This scan failed">
          It stopped at {next.label}. Retry if it is eligible, or start a new scan.
        </Alert>
      ) : null}

      <ScanHeader scan={scan} identity={identity} next={next} flags={flags} latestEvent={latestEvent} />

      <ScanControls
        runId={scan.id}
        clientId={scan.clientId}
        next={next}
        readiness={readiness}
        flags={flags}
        canCancel={canCancel}
        canRetry={canRetry}
        cancelAction={cancelProspectScanForm}
        retryAction={retryProspectScanForm}
      />

      <StageReadiness next={next} />
      <DiscoverySummary discovery={discovery} crawlerEnabled={flags.crawlerEnabled} />
      <PageEvidenceTable pages={discovery.pages} />
      <ReasoningReadiness readiness={readiness} flags={flags} />
      <EvidenceCoverage evidence={evidence} />
      <RuntimeTimeline rows={rows} />

      <OperationalPanel>
        <div className={styles.railHead}>
          <span>Prospect assessment · deterministic</span>
          <span>{report.present ? "produced" : "not run"}</span>
        </div>
        <div style={{ paddingTop: "var(--space-3)", display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
          <form action={assessProspectForm}>
            <input type="hidden" name="runId" value={scan.id} />
            <Button type="submit" variant={report.present ? "secondary" : "primary"} disabled={!canAssess}>
              {report.present ? "Re-run assessment" : "Run assessment"}
            </Button>
          </form>
          <span className={styles.stageReason}>
            {canAssess
              ? "Runs discovery evidence through the Prospect Intelligence Engine and produces reviewable artifacts. No AI credit is spent."
              : "Run the discovery stages first — an assessment needs a discovery manifest."}
          </span>
        </div>
      </OperationalPanel>

      {reportReviewRequired ? (
        <Alert tone="warning" title="Machine-derived assessment — review required">
          This report was produced deterministically from crawled evidence and has not been approved. Every figure traces to evidence; review it before it
          reaches a prospect.
        </Alert>
      ) : null}
      <InternalReportView view={report} />
      <CompetitorIntelligencePanel competitor={competitor} />
      <ProposalIntelligencePanel proposal={proposalIntelligence} />
      <NarrativePanel narrative={narrative} />
      <ProposalReview view={proposal} />
      <ProspectSummary summary={summary} />
    </>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className={styles.workspace} aria-busy="true" aria-label="Loading the scan workspace">
      <SkeletonBlock height="220px" radius="var(--radius-xl)" />
      <SkeletonBlock height="160px" radius="var(--radius-xl)" />
      <SkeletonBlock height="320px" radius="var(--radius-xl)" />
    </div>
  );
}

function Unauthorized() {
  return (
    <div className={styles.page}>
      <div className={styles.canvas}>
        <OperationalPanel>
          <EmptyWorkspace icon="lock" title="You don't have access to the Prospect Scanner" body="Your role can't view or run prospect scans." />
        </OperationalPanel>
      </div>
    </div>
  );
}
