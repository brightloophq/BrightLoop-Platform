import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthorizationError, assertCoreSurfacesRead, canWriteScans, buildBusinessScanView } from "@brightloop/domain";
import { DOMAIN_KEYS, DOMAIN_META } from "@brightloop/schema";
import {
  Alert,
  Badge,
  Button,
  EmptyWorkspace,
  Icon,
  IndexGauge,
  OperationalPanel,
  OperationalTable,
  SectionHeader,
  SectionRule,
  SkeletonBlock,
  SystemMap,
  type OperationalColumn,
} from "@brightloop/ui";
import { MotionProvider } from "@brightloop/ui/motion";
import { requireSurface } from "@/lib/auth";
import { getCoreSurfaceRepository } from "@/lib/repositories";
import { createClient } from "@/lib/supabase/server";
import { startScanForm, addFindingForm } from "./scan-actions";
import styles from "./scan.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Business Scan · Auxion" };

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

interface FindingRow {
  domainKey: string;
  domainCode: string;
  domainLabel: string;
  finding: string;
  baseline: string | null;
  priority: string;
}

async function listOrgs(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("id, company").order("company", { ascending: true }).limit(200);
  return (data ?? []).map((r) => ({ id: r.id, name: r.company }));
}

async function orgName(clientId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("company").eq("id", clientId).maybeSingle();
  return data?.company ?? "This organization";
}

export default async function BusinessScanPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const actor = await requireSurface("admin");
  try {
    assertCoreSurfacesRead(actor);
  } catch (err) {
    if (err instanceof AuthorizationError) return <Unauthorized />;
    throw err;
  }

  const params = await searchParams;
  const clientId = first(params["client"]) ?? null;
  const scanError = first(params["scanError"]) ?? null;
  const canWrite = canWriteScans(actor);

  return (
    <div className={styles.page}>
      <MotionProvider>
        <div className={styles.canvas}>
          {clientId ? (
            <Suspense key={clientId} fallback={<ScanSkeleton />}>
              <ScanWorkspace clientId={clientId} canWrite={canWrite} scanError={scanError} />
            </Suspense>
          ) : (
            <Suspense fallback={<ScanSkeleton />}>
              <OrgPicker />
            </Suspense>
          )}
        </div>
      </MotionProvider>
    </div>
  );
}

function Hero({ title, kicker, hint }: { title: string; kicker: string; hint: string }) {
  return <SectionHeader as="h1" size="page" index="01" kicker={kicker} title={title} hint={hint} />;
}

async function OrgPicker() {
  const orgs = await listOrgs();
  return (
    <>
      <Hero
        title="Business Scan"
        kicker="Diagnose · Step 01"
        hint="Assess seven domains against category benchmarks — the baseline Index and the gaps Auxion will close."
      />
      <OperationalPanel>
        {orgs.length === 0 ? (
          <EmptyWorkspace icon="lock" title="No organizations yet" body="Create a client organization before running a scan." />
        ) : (
          <>
            <SectionRule index="01" label="Choose an organization to diagnose" meta={`${orgs.length} on file`} />
            <div className={styles.orgGrid}>
              {orgs.map((o) => (
                <Link key={o.id} href={`/admin/business-scan?client=${o.id}`} className={styles.orgCard}>
                  <span className={styles.orgIcon}>
                    <Icon name="gauge" size={16} />
                  </span>
                  {o.name}
                </Link>
              ))}
            </div>
          </>
        )}
      </OperationalPanel>
    </>
  );
}

async function ScanWorkspace({ clientId, canWrite, scanError }: { clientId: string; canWrite: boolean; scanError?: string | null }) {
  const repo = await getCoreSurfaceRepository();
  let scan: Awaited<ReturnType<typeof repo.latestScan>>;
  let domains: Awaited<ReturnType<typeof repo.listDomains>>;
  let name: string;
  try {
    [scan, domains, name] = await Promise.all([repo.latestScan(clientId), repo.listDomains(clientId), orgName(clientId)]);
  } catch {
    return (
      <>
        <Hero title="Business Scan" kicker="Diagnose · Step 01" hint="Baseline the seven domains." />
        <Alert tone="danger" title="We couldn't load the scan">
          Something went wrong reading the diagnosis. <Link href={`/admin/business-scan?client=${clientId}`}>Try again</Link>.
        </Alert>
      </>
    );
  }

  if (!scan) {
    return (
      <>
        <Hero
          title="Not yet diagnosed"
          kicker={`${name} · Diagnose`}
          hint="Run a diagnosis to baseline the seven domains against category benchmarks and reveal the gaps to close."
        />
        <OperationalPanel>
          {scanError ? (
            <Alert tone="danger" title="Couldn't start the scan">
              {scanError}
            </Alert>
          ) : null}
          <EmptyWorkspace
            icon="gauge"
            title="No scan yet"
            body="Run a diagnosis to baseline the seven domains and reveal the gaps to close."
            action={
              canWrite ? (
                <form action={startScanForm}>
                  <input type="hidden" name="clientId" value={clientId} />
                  <input type="hidden" name="targetIndex" value={92} />
                  <Button type="submit" variant="primary">
                    Start diagnosis
                  </Button>
                </form>
              ) : null
            }
          />
        </OperationalPanel>
      </>
    );
  }

  const findings = await repo.listFindings(scan.id);
  const view = buildBusinessScanView(scan, domains, findings);
  const rows: FindingRow[] = view.findings;
  const idx = view.systemMap.index;
  const readCount = view.systemMap.nodes.length;

  const columns: OperationalColumn<FindingRow>[] = [
    {
      key: "domain",
      header: "Domain",
      label: "Domain",
      render: (r) => (
        <span className={styles.domainCell}>
          <span className={styles.domainCode}>{r.domainCode}</span>
          <span className={styles.domainName}>{r.domainLabel}</span>
        </span>
      ),
    },
    { key: "finding", header: "Finding", label: "Finding", render: (r) => r.finding },
    { key: "baseline", header: "Baseline", label: "Baseline", hideOnMobile: true, render: (r) => r.baseline ?? "—" },
    { key: "priority", header: "Priority", label: "Priority", align: "end", render: (r) => <Badge status={r.priority}>{r.priority}</Badge> },
  ];

  return (
    <>
      <Hero
        title="Diagnosed."
        kicker={`${name} · AI-assisted onboarding`}
        hint="Seven domains assessed against category benchmarks. Below is the baseline System Map, the baseline Index, and the gaps Auxion will close once the System is assembled."
      />

      <OperationalPanel tone="anchor">
        <div className={styles.cardHead}>System Map · Blueprint · {readCount} / 7 read</div>
        <div className={styles.instrument}>
          <div className={styles.systemMap}>
            <SystemMap nodes={view.systemMap.nodes} index={idx} size={300} />
          </div>
          <IndexGauge
            label="Baseline Index"
            value={idx.value}
            target={scan.targetIndex}
            note={idx.value < scan.targetIndex ? `${scan.targetIndex - idx.value} below target` : "at target"}
            caption={`${view.gapCount} gaps to close. The next stage assembles these into one operating System; the Index climbs as each node goes Live.`}
          />
        </div>
        <div className={styles.cardFoot}>
          <span>Mode · Read-only</span>
          <span>Nodes unlit · Not yet operating</span>
        </div>
      </OperationalPanel>

      <div>
        <SectionRule index="02" label="Diagnosis" meta={`${view.gapCount} gaps to close`} />
        <OperationalPanel className={styles.ledgerPanel}>
          {rows.length === 0 ? (
            <EmptyWorkspace icon="search" title="No findings yet" body="Add a diagnosis finding for a domain below." />
          ) : (
            <OperationalTable caption="Diagnosis ledger." columns={columns} rows={rows} rowKey={(r) => `${r.domainKey}-${r.finding}`} />
          )}
          {canWrite ? <AddFinding clientId={clientId} scanId={scan.id} /> : null}
        </OperationalPanel>
      </div>
    </>
  );
}

function AddFinding({ clientId, scanId }: { clientId: string; scanId: string }) {
  return (
    <form action={addFindingForm} className={styles.findingForm}>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="scanId" value={scanId} />
      <select name="domainKey" className={styles.select} defaultValue="web" aria-label="Domain">
        {DOMAIN_KEYS.map((k) => (
          <option key={k} value={k}>
            {DOMAIN_META[k].code} · {DOMAIN_META[k].label}
          </option>
        ))}
      </select>
      <input name="finding" className={styles.input} placeholder="What was found?" maxLength={500} required aria-label="Finding" />
      <input name="baseline" className={styles.inputSm} placeholder="Baseline" maxLength={120} aria-label="Baseline" />
      <select name="priority" className={styles.select} defaultValue="medium" aria-label="Priority">
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <Button type="submit" variant="secondary">
        Add finding
      </Button>
    </form>
  );
}

function ScanSkeleton() {
  return (
    <div className={styles.workspace} aria-busy="true" aria-label="Loading scan">
      <SkeletonBlock height="96px" radius="var(--radius-xl)" />
      <SkeletonBlock height="320px" radius="var(--radius-xl)" />
      <SkeletonBlock height="240px" radius="var(--radius-xl)" />
    </div>
  );
}

function Unauthorized() {
  return (
    <div className={styles.page}>
      <div className={styles.canvas}>
        <OperationalPanel>
          <EmptyWorkspace icon="lock" title="You don't have access to Business Scan" body="Your role can't view the transformation command center." />
        </OperationalPanel>
      </div>
    </div>
  );
}
