import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthorizationError, assertCoreSurfacesRead, canWriteScans, buildBusinessScanView } from "@brightloop/domain";
import { DOMAIN_KEYS, DOMAIN_META } from "@brightloop/schema";
import { Alert, Badge, Button, EmptyWorkspace, IndexGauge, OperationalPanel, OperationalTable, SectionHeader, SectionRule, SkeletonBlock, SystemMap, type OperationalColumn } from "@brightloop/ui";
import { MotionProvider } from "@brightloop/ui/motion";
import { scoreField } from "@/lib/baseline-scores";
import { unreachableDomainLabels } from "@/lib/diagnosis-import";
import { listImportableScans } from "@/lib/scanner-data";
import { requireSurface } from "@/lib/auth";
import { getCoreSurfaceRepository } from "@/lib/repositories";
import { createClient } from "@/lib/supabase/server";
import { startScanForm, addFindingForm, setBaselinesForm, importDiagnosisForm } from "./scan-actions";
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
  const findingError = first(params["findingError"]) ?? null;
  const baselineError = first(params["baselineError"]) ?? null;
  const importError = first(params["importError"]) ?? null;
  const imported = first(params["imported"]) ?? null;
  const canWrite = canWriteScans(actor);

  return (
    <div className={styles.page}>
      <MotionProvider>
        <div className={styles.canvas}>
          {clientId ? (
            <Suspense key={clientId} fallback={<ScanSkeleton />}>
              <ScanWorkspace clientId={clientId} canWrite={canWrite} scanError={scanError} findingError={findingError} baselineError={baselineError} importError={importError} imported={imported} />
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
          <EmptyWorkspace title="No organizations yet" body="Create a client organization before running a scan." />
        ) : (
          <>
            <SectionRule index="01" label="Choose an organization to diagnose" meta={`${orgs.length} on file`} />
            <div className={styles.orgGrid}>
              {orgs.map((o) => (
                <Link key={o.id} href={`/admin/business-scan?client=${o.id}`} className={styles.orgCard}>
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

async function ScanWorkspace({ clientId, canWrite, scanError, findingError, baselineError, importError, imported }: { clientId: string; canWrite: boolean; scanError?: string | null; findingError?: string | null; baselineError?: string | null; importError?: string | null; imported?: string | null }) {
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
          hint="Open the diagnosis to seed the seven domains, then score each one and record what you found."
        />
        <OperationalPanel>
          {scanError ? (
            <Alert tone="danger" title="Couldn't start the scan">
              {scanError}
            </Alert>
          ) : null}
          <EmptyWorkspace
            title="No scan yet"
            body="This opens the worksheet and seeds the seven domains unlit. You then score each domain and record findings — nothing is measured automatically."
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

  const [findings, importable] = await Promise.all([repo.listFindings(scan.id), listImportableScans(clientId)]);
  const view = buildBusinessScanView(scan, domains, findings);
  const rows: FindingRow[] = view.findings;
  const idx = view.systemMap.index;
  const readCount = view.systemMap.nodes.length;
  const scoredCount = domains.filter((d) => d.baselineScore !== null).length;

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

      {canWrite ? (
        <div>
          <SectionRule index="02" label="Import from a prospect scan" meta={`${importable.length} available`} />
          <OperationalPanel>
            {importError ? (
              <Alert tone="danger" title="Couldn't import the diagnosis">
                {importError}
              </Alert>
            ) : null}
            {imported ? <Alert tone="success" title="Diagnosis imported">{imported}</Alert> : null}
            <ImportDiagnosis clientId={clientId} scans={importable} />
          </OperationalPanel>
        </div>
      ) : null}

      {canWrite ? (
        <div>
          <SectionRule index="03" label="Baseline scores" meta={`${scoredCount} / 7 scored`} />
          <OperationalPanel>
            {baselineError ? (
              <Alert tone="danger" title="Couldn't save the baseline scores">
                {baselineError}
              </Alert>
            ) : null}
            <BaselineScores clientId={clientId} domains={domains} />
          </OperationalPanel>
        </div>
      ) : null}

      <div>
        <SectionRule index={canWrite ? "04" : "02"} label="Diagnosis" meta={`${view.gapCount} gaps to close`} />
        <OperationalPanel className={styles.ledgerPanel}>
          {/* A finding that failed to save used to vanish without a word — the
              form action discarded its result. The reason arrives here now. */}
          {findingError ? (
            <Alert tone="danger" title="Couldn't add the finding">
              {findingError}
            </Alert>
          ) : null}
          {rows.length === 0 ? (
            <EmptyWorkspace title="No findings yet" body="Add a diagnosis finding for a domain below." />
          ) : (
            <OperationalTable caption="Diagnosis ledger." columns={columns} rows={rows} rowKey={(r) => `${r.domainKey}-${r.finding}`} />
          )}
          {canWrite ? <AddFinding clientId={clientId} scanId={scan.id} /> : null}
        </OperationalPanel>
      </div>
    </>
  );
}

/**
 * Score the seven domains — the control that did not exist.
 *
 * `upsertDomain` has always accepted `baselineScore`, and the System Map and
 * the Index gauge have always read it. Nothing ever wrote it, so the nodes
 * stayed unlit and the Baseline Index stayed 0 however many times you pressed
 * Start diagnosis. This is the missing input to that instrument.
 *
 * One form for all seven, so scoring a client is one submit rather than seven.
 * A blank field means "leave this domain as it is" — never zero, which would
 * silently score a domain you simply had not got to yet.
 */
/**
 * Import a diagnosis from a prospect scan that has already been run.
 *
 * This is the bridge between the two halves of diagnosis: the Prospect Scanner
 * measures a real website, the Business Scan is where a client's baseline
 * lives. Before this, the second could not see the first — the seven domains
 * were scored by hand or not at all.
 *
 * It offers only scans that have REACHED an assessment, and never runs one.
 * Stage execution stays in the Prospect Scanner, one stage per click behind its
 * kill switches, because stages spend provider budget; importing is free and
 * repeatable.
 *
 * It also says plainly which domains a scan cannot reach. A website scan scores
 * thirteen maturity categories and none of them speaks to Delivery, so that
 * domain stays unscored rather than being filled with a number nothing
 * measured. The list is derived from the mapping itself, so it cannot drift.
 */
function ImportDiagnosis({
  clientId,
  scans,
}: {
  clientId: string;
  scans: { id: string; label: string; completedAt: string | null }[];
}) {
  if (scans.length === 0) {
    return (
      <p className={styles.scoreHint}>
        No completed prospect scan for this organization yet. Run one in the{" "}
        <Link href="/admin/prospect-scanner">Prospect Scanner</Link> and its assessment can be
        imported here as the baseline.
      </p>
    );
  }

  return (
    <form action={importDiagnosisForm} className={styles.scoreForm}>
      <input type="hidden" name="clientId" value={clientId} />
      <p className={styles.scoreHint}>
        Copies the scan&rsquo;s scored categories onto the System Map, and its risks and observed
        weaknesses into the ledger below. Not measured by a website scan:{" "}
        {unreachableDomainLabels()} — left blank for you to judge. Importing the same scan twice
        adds nothing new.
      </p>
      <div className={styles.importRow}>
        <select name="runId" className={styles.select} aria-label="Completed scan to import">
          {scans.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
              {s.completedAt ? ` · ${new Date(s.completedAt).toLocaleDateString()}` : ""}
            </option>
          ))}
        </select>
        <Button type="submit" variant="primary">
          Import diagnosis
        </Button>
      </div>
    </form>
  );
}

function BaselineScores({
  clientId,
  domains,
}: {
  clientId: string;
  domains: { key: string; baselineScore: number | null }[];
}) {
  const scoreFor = (key: string) => domains.find((d) => d.key === key)?.baselineScore ?? undefined;

  return (
    <form action={setBaselinesForm} className={styles.scoreForm}>
      <input type="hidden" name="clientId" value={clientId} />
      <p className={styles.scoreHint}>
        Score each domain 0–100 against where it should be. Leave a field blank to skip it — the
        System Map lights and the Baseline Index moves as domains are scored.
      </p>
      <div className={styles.scoreGrid}>
        {DOMAIN_KEYS.map((k) => (
          <label key={k} className={styles.scoreField}>
            <span className={styles.scoreLabel}>
              <span className={styles.domainCode}>{DOMAIN_META[k].code}</span>
              <span className={styles.domainName}>{DOMAIN_META[k].label}</span>
            </span>
            <input
              type="number"
              inputMode="numeric"
              name={scoreField(k)}
              min={0}
              max={100}
              step={1}
              defaultValue={scoreFor(k)}
              placeholder="—"
              className={styles.scoreInput}
              aria-label={`${DOMAIN_META[k].label} baseline score`}
            />
          </label>
        ))}
      </div>
      <Button type="submit" variant="secondary">
        Save baseline scores
      </Button>
    </form>
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
          <EmptyWorkspace title="You don't have access to Business Scan" body="Your role can't view the transformation command center." />
        </OperationalPanel>
      </div>
    </div>
  );
}
