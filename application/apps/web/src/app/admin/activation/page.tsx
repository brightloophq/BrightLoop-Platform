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
  IndexGauge,
  OperationalPanel,
  SectionHeader,
  SectionRule,
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

async function orgName(clientId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("company").eq("id", clientId).maybeSingle();
  return data?.company ?? "This organization";
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

function Hero({ title, kicker, hint }: { title: string; kicker: string; hint: string }) {
  return <SectionHeader as="h1" size="page" index="01" kicker={kicker} title={title} hint={hint} />;
}

async function OrgPicker() {
  const orgs = await listOrgs();
  return (
    <>
      <Hero
        title="Activation"
        kicker="Activate · Step 03"
        hint="Bring the System online — assemble seven domains until the Blueprint becomes a live Command Center."
      />
      <OperationalPanel>
        {orgs.length === 0 ? (
          <EmptyWorkspace icon="lock" title="No organizations yet" body="Create a client organization first." />
        ) : (
          <>
            <SectionRule index="01" label="Choose an organization to activate" meta={`${orgs.length} on file`} />
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
          </>
        )}
      </OperationalPanel>
    </>
  );
}

async function AssemblyWorkspace({ clientId, canWrite }: { clientId: string; canWrite: boolean }) {
  const repo = await getCoreSurfaceRepository();
  let domains: Awaited<ReturnType<typeof repo.listDomains>>;
  let name: string;
  try {
    [domains, name] = await Promise.all([repo.listDomains(clientId), orgName(clientId)]);
  } catch {
    return (
      <>
        <Hero title="Activation" kicker="Activate · Step 03" hint="Bring the System online." />
        <Alert tone="danger" title="We couldn't load activation">
          Something went wrong. <Link href={`/admin/activation?client=${clientId}`}>Try again</Link>.
        </Alert>
      </>
    );
  }

  if (domains.length === 0) {
    return (
      <>
        <Hero
          title="Nothing to assemble"
          kicker={`${name} · Activate`}
          hint="Run a Business Scan first to baseline the seven domains, then activate them here."
        />
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
      </>
    );
  }

  const view = buildActivationView(domains);
  const idx = view.systemMap.index;
  const liveCount = view.operatingCount;

  return (
    <>
      <Hero
        title={view.complete ? "Operating." : "Assembling."}
        kicker={`${name} · Company assembly`}
        hint={
          view.complete
            ? "Your System is live. All seven domains are operating and the Console is ready — this is the state of the System at the completion of Activation."
            : "Assemble each domain until the Blueprint becomes a live Command Center. The Index climbs as each node goes Live."
        }
      />

      <OperationalPanel tone="anchor">
        <div className={styles.cardHead}>System Map · {view.complete ? "Command Center" : "Assembling"} · {liveCount} / {view.total} live</div>
        <div className={styles.instrument}>
          <div className={styles.systemMap}>
            <SystemMap nodes={view.systemMap.nodes} index={idx} size={300} />
          </div>
          <IndexGauge
            label="System Index"
            value={idx.value}
            target={idx.target}
            note={view.complete ? "all nominal" : `${liveCount} of ${view.total} live`}
            caption={
              view.complete
                ? "Ink became signal — the Blueprint is now a live Command Center. Continuous optimization carries the Index toward target."
                : "As each node goes Live the System Map lights amber and the Index climbs toward target."
            }
          />
        </div>
        <div className={styles.cardFoot}>
          <span>{view.complete ? "Uptime 100% · All nominal" : "Assembly in progress"}</span>
          <span>{liveCount} / {view.total} activated</span>
        </div>
      </OperationalPanel>

      <div>
        <SectionRule index="02" label="Assembly sequence" meta={`${liveCount} / ${view.total} activated`} />
        <OperationalPanel className={styles.ledgerPanel}>
          {view.complete ? (
            <Alert tone="success" title="System operating">
              All seven domains are Live — the Blueprint is now a Command Center.
            </Alert>
          ) : null}
          <ul className={styles.steps}>
            {view.steps.map((s) => (
              <li key={s.key} className={styles.step}>
                <span className={[styles.stepDot, s.live ? styles.stepDotLive : null].filter(Boolean).join(" ")} aria-hidden="true" />
                <span className={styles.stepCode}>{s.code}</span>
                <span className={styles.stepLabel}>{s.label}</span>
                {canWrite && !s.live ? (
                  <form action={activateDomainFormAction} className={styles.stepAction}>
                    <input type="hidden" name="clientId" value={clientId} />
                    <input type="hidden" name="key" value={s.key} />
                    <input type="hidden" name="status" value="operating" />
                    <input type="hidden" name="currentScore" value={90} />
                    <Button type="submit" variant="primary" size="sm">
                      Activate
                    </Button>
                  </form>
                ) : (
                  <Badge status={s.status}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
                )}
              </li>
            ))}
          </ul>
        </OperationalPanel>
      </div>
    </>
  );
}

function Loading() {
  return (
    <div className={styles.workspace} aria-busy="true" aria-label="Loading activation">
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
          <EmptyWorkspace icon="lock" title="You don't have access to Activation" body="Your role can't view the transformation command center." />
        </OperationalPanel>
      </div>
    </div>
  );
}
