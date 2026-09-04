import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthorizationError, assertCapability } from "@brightloop/domain";
import {
  Alert,
  Badge,
  EmptyWorkspace,
  OperationalPanel,
  OperationalTable,
  SectionHeader,
  SectionRule,
  SkeletonBlock,
  type OperationalColumn,
} from "@brightloop/ui";
import { MotionProvider } from "@brightloop/ui/motion";
import { requireSurface } from "@/lib/auth";
import { listScanSubjects, loadScannerList, readRuntimeFlags } from "@/lib/scanner-data";
import { stageLabel, type ProspectIdentity } from "@/lib/prospect-scanner";
import type { ScanDTO } from "@brightloop/application";
import { ProspectScanForm } from "./components/ProspectScanForm";
import { KillSwitches } from "./components/KillSwitches";
import { createProspectScanState } from "./scanner-actions";
import styles from "./scanner.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prospect Scanner · Auxion" };

/** Capability that gates the internal scanner (internal roles only). */
const SCANNER_CAP = "transformation.scan.write";

interface Row {
  scan: ScanDTO;
  identity: ProspectIdentity;
}

/**
 * Internal Prospect Scanner — index (Phase C · Sprint C4).
 *
 * Operator-only. `requireSurface("admin")` blocks every client role at the
 * surface, and the capability assert blocks an internal role that lacks scan
 * write. There is no public or anonymous entry point to this route.
 */
export default async function ProspectScannerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireSurface("admin");
  try {
    assertCapability(actor, SCANNER_CAP);
  } catch (error) {
    if (error instanceof AuthorizationError) return <Unauthorized />;
    throw error;
  }

  const params = await searchParams;
  const formError = typeof params["formError"] === "string" ? params["formError"] : null;

  return (
    <div className={styles.page}>
      <MotionProvider>
        <div className={styles.canvas}>
          <SectionHeader
            as="h1"
            size="page"
            index="01"
            kicker="Internal · Prospect intelligence"
            title="Prospect Scanner"
            hint="Scan a prospect's public website, advance the pipeline one stage at a time, and review the evidence behind every finding."
          />

          {formError ? (
            <Alert tone="danger" title="Couldn't create the scan">
              {formError}
            </Alert>
          ) : null}

          <Suspense fallback={<ScannerSkeleton />}>
            <ScannerBody />
          </Suspense>
        </div>
      </MotionProvider>
    </div>
  );
}

async function ScannerBody() {
  const [data, subjects] = await Promise.all([loadScannerList(), listScanSubjects()]);
  const flags = data?.flags ?? readRuntimeFlags();

  return (
    <>
      <OperationalPanel>
        <div className={styles.railHead}>
          <span>System state</span>
          <span>Manual execution only</span>
        </div>
        <div style={{ paddingTop: "var(--space-4)" }}>
          <KillSwitches flags={flags} />
        </div>
      </OperationalPanel>

      <OperationalPanel>
        <SectionRule index="02" label="New prospect scan" meta="creates a queued run" />
        {subjects.length === 0 ? (
          <EmptyWorkspace
            icon="lock"
            title="No scan subjects yet"
            body="Create a lead or client organization before starting a scan."
            action={<Link href="/admin/leads">Go to leads</Link>}
          />
        ) : (
          <ProspectScanForm
            subjects={subjects}
            crawlerEnabled={flags.crawlerEnabled}
            providerEnabled={flags.providerEnabled}
            estimatedMaxCostUsd={flags.estimatedMaxCostUsd}
            action={createProspectScanState}
          />
        )}
      </OperationalPanel>

      <ScanList rows={data?.scans ?? []} />
    </>
  );
}

function ScanList({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <OperationalPanel>
        <SectionRule index="03" label="Recent scans" meta="none" />
        <EmptyWorkspace icon="search" title="No scans yet" body="Create your first prospect scan above. Nothing runs until you execute a stage." />
      </OperationalPanel>
    );
  }

  const columns: OperationalColumn<Row>[] = [
    {
      key: "prospect",
      header: "Prospect",
      label: "Prospect",
      render: (r) => (
        <Link href={`/admin/prospect-scanner/${r.scan.id}`} className={styles.scanLink}>
          {r.identity.businessName ?? r.identity.websiteUrl ?? r.scan.scanId}
        </Link>
      ),
    },
    { key: "url", header: "Website", label: "Website", hideOnMobile: true, render: (r) => <span className={styles.mono}>{r.identity.websiteUrl ?? "—"}</span> },
    { key: "status", header: "Status", label: "Status", render: (r) => <Badge status={r.scan.lifecycle}>{r.scan.lifecycle}</Badge> },
    { key: "stage", header: "Stage", label: "Stage", hideOnMobile: true, render: (r) => <span className={styles.mono}>{stageLabel(r.scan.currentStage)}</span> },
    { key: "progress", header: "Progress", label: "Progress", align: "end", render: (r) => <span className={styles.mono}>{r.scan.progress}%</span> },
    {
      key: "created",
      header: "Created",
      label: "Created",
      align: "end",
      hideOnMobile: true,
      render: (r) => <span className={styles.mono}>{new Date(r.scan.createdAt).toLocaleDateString()}</span>,
    },
  ];

  return (
    <OperationalPanel>
      <SectionRule index="03" label="Recent scans" meta={`${rows.length} on file`} />
      <OperationalTable caption="Recent prospect scans." columns={columns} rows={rows} rowKey={(r) => r.scan.id} />
    </OperationalPanel>
  );
}

function ScannerSkeleton() {
  return (
    <div className={styles.workspace} aria-busy="true" aria-label="Loading the prospect scanner">
      <SkeletonBlock height="120px" radius="var(--radius-xl)" />
      <SkeletonBlock height="420px" radius="var(--radius-xl)" />
      <SkeletonBlock height="240px" radius="var(--radius-xl)" />
    </div>
  );
}

function Unauthorized() {
  return (
    <div className={styles.page}>
      <div className={styles.canvas}>
        <OperationalPanel>
          <EmptyWorkspace icon="lock" title="You don't have access to the Prospect Scanner" body="Your role can't create or run prospect scans." />
        </OperationalPanel>
      </div>
    </div>
  );
}
