import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthorizationError, assertCoreSurfacesRead, canActivate, buildActivationView } from "@brightloop/domain";
import {
  Alert,
  Badge,
  Button,
  EmptyWorkspace,
  Icon,
  MetricCard,
  OperationalPanel,
  SectionHeader,
  SkeletonBlock,
  SystemMap,
} from "@brightloop/ui";
import { MotionProvider } from "@brightloop/ui/motion";
import { requireSurface } from "@/lib/auth";
import { getCoreSurfaceRepository } from "@/lib/repositories";
import { createClient } from "@/lib/supabase/server";
import { activateDomainFormAction } from "./activation-actions";
import styles from "./activation.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Activation · Auxion" };

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATUS_LABEL: Record<string, string> = { not_operating: "Planned", assembling: "Assembling", operating: "Live" };

async function listOrgs(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("id, company").order("company", { ascending: true }).limit(200);
  return (data ?? []).map((r) => ({ id: r.id, name: r.company }));
}

export default async function ActivationPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const actor = await requireSurface("admin");
  try {
    assertCoreSurfacesRead(actor);
  } catch (err) {
    if (err instanceof AuthorizationError) return <Unauthorized />;
    throw err;
  }
  const clientId = first((await searchParams)["client"]) ?? null;
  const canWrite = canActivate(actor);

  return (
    <div className={styles.page}>
      <MotionProvider>
        <div className={styles.canvas}>
          <SectionHeader
            as="h1"
            size="page"
            kicker="Activate · Step 03"
            title="Activation"
            hint="Bring the System online — assemble seven domains until the Blueprint becomes a live Command Center."
          />
          {clientId ? (
            <Suspense key={clientId} fallback={<Loading />}>
              <AssemblyWorkspace clientId={clientId} canWrite={canWrite} />
            </Suspense>
          ) : (
            <Suspense fallback={<Loading />}>
              <OrgPicker />
            </Suspense>
          )}
        </div>
      </MotionProvider>
    </div>
  );
}

async function OrgPicker() {
  const orgs = await listOrgs();
  if (orgs.length === 0) {
    return (
      <OperationalPanel>
        <EmptyWorkspace icon="lock" title="No organizations yet" body="Create a client organization first." />
      </OperationalPanel>
    );
  }
  return (
    <OperationalPanel>
      <SectionHeader title="Choose an organization to activate" />
      <div className={styles.orgGrid}>
        {orgs.map((o) => (
          <Link key={o.id} href={`/admin/activation?client=${o.id}`} className={styles.orgCard}>
            <span className={styles.orgIcon}>
              <Icon name="workflow" size={16} />
            </span>
            {o.name}
          </Link>
        ))}
      </div>
    </OperationalPanel>
  );
}

async function AssemblyWorkspace({ clientId, canWrite }: { clientId: string; canWrite: boolean }) {
  const repo = await getCoreSurfaceRepository();
  let domains: Awaited<ReturnType<typeof repo.listDomains>>;
  try {
    domains = await repo.listDomains(clientId);
  } catch {
    return (
      <Alert tone="danger" title="We couldn't load activation">
        Something went wrong. <Link href={`/admin/activation?client=${clientId}`}>Try again</Link>.
      </Alert>
    );
  }

  if (domains.length === 0) {
    return (
      <OperationalPanel>
        <EmptyWorkspace
          icon="workflow"
          title="Nothing to assemble yet"
          body="Run a Business Scan first to baseline the seven domains, then activate them here."
          action={
            <Button asChild variant="secondary">
              <Link href={`/admin/business-scan?client=${clientId}`}>Go to Business Scan</Link>
            </Button>
          }
        />
      </OperationalPanel>
    );
  }

  const view = buildActivationView(domains);

  return (
    <>
      <div className={styles.top}>
        <OperationalPanel tone="anchor">
          <SectionHeader
            kicker={view.complete ? "Operating" : "Assembling"}
            title="System Map"
            hint={`${view.operatingCount} / ${view.total} domains Live.`}
          />
          <div className={styles.systemMap}>
            <SystemMap nodes={view.systemMap.nodes} index={view.systemMap.index} size={300} />
          </div>
        </OperationalPanel>
        <div className={styles.metrics}>
          <MetricCard label="System Index" value={view.systemMap.index.value} icon="gauge" />
          <MetricCard label="Live domains" value={`${view.operatingCount}/${view.total}`} icon="check-circle" />
        </div>
      </div>

      <OperationalPanel>
        <SectionHeader title="Assembly sequence" hint={view.complete ? "All systems operating." : "Activate each domain to bring it Live."} />
        {view.complete ? (
          <Alert tone="success" title="System operating">
            All seven domains are Live — the Blueprint is now a Command Center.
          </Alert>
        ) : null}
        <ul className={styles.steps}>
          {view.steps.map((s) => (
            <li key={s.key} className={styles.step}>
              <span className={styles.stepCode}>{s.code}</span>
              <span className={styles.stepLabel}>{s.label}</span>
              <Badge status={s.status}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
              {canWrite && !s.live ? (
                <form action={activateDomainFormAction} className={styles.stepAction}>
                  <input type="hidden" name="clientId" value={clientId} />
                  <input type="hidden" name="key" value={s.key} />
                  <input type="hidden" name="status" value="operating" />
                  <input type="hidden" name="currentScore" value={90} />
                  <Button type="submit" variant="primary">
                    Activate
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </OperationalPanel>
    </>
  );
}

function Loading() {
  return (
    <div className={styles.workspace} aria-busy="true" aria-label="Loading activation">
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
          <EmptyWorkspace icon="lock" title="You don't have access to Activation" body="Your role can't view the transformation command center." />
        </OperationalPanel>
      </div>
    </div>
  );
}
