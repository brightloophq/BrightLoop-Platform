import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AuthorizationError,
  assertSignalsRead,
  canWriteSignals,
  parseSignalListQuery,
  buildSignalListView,
  signalsHref,
  SIGNAL_RECENT_DAYS,
  type SignalListQuery,
} from "@brightloop/domain";
import {
  Alert,
  Badge,
  Button,
  EmptyWorkspace,
  FilterBar,
  MetricCard,
  OperationalPanel,
  OperationalTable,
  Pagination,
  SectionHeader,
  SkeletonBlock,
  type OperationalColumn,
} from "@brightloop/ui";
import { MotionProvider } from "@brightloop/ui/motion";
import { requireSurface } from "@/lib/auth";
import { getSignalsRepository } from "@/lib/repositories";
import { SignalsControls } from "./SignalsControls";
import styles from "./signals.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Signals · Auxion" };

type RawParams = Record<string, string | string[] | undefined>;

interface Row {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  orgName: string;
  source: string | null;
  createdByName: string | null;
  createdAt: string;
  href: string;
}

export default async function SignalsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const actor = await requireSurface("admin");
  try {
    assertSignalsRead(actor);
  } catch (err) {
    if (err instanceof AuthorizationError) return <Unauthorized />;
    throw err;
  }

  const query = parseSignalListQuery(await searchParams);
  const canWrite = canWriteSignals(actor);

  return (
    <div className={styles.page}>
      <MotionProvider>
        <div className={styles.canvas}>
          <SectionHeader
            as="h1"
            size="page"
            kicker="Transformation"
            title="Signals"
            hint="Detected changes worth attention — the intake and triage surface of the transformation cycle."
            action={
              canWrite ? (
                <Button asChild variant="primary">
                  <Link href="/admin/signals/new">Create Signal</Link>
                </Button>
              ) : null
            }
          />
          <Suspense key={signalsHref(query)} fallback={<SignalsSkeleton />}>
            <SignalsWorkspace query={query} canWrite={canWrite} />
          </Suspense>
        </div>
      </MotionProvider>
    </div>
  );
}

async function SignalsWorkspace({ query, canWrite }: { query: SignalListQuery; canWrite: boolean }) {
  const repo = await getSignalsRepository();

  let summary: Awaited<ReturnType<typeof repo.summary>>;
  let view: ReturnType<typeof buildSignalListView>;
  let orgs: Awaited<ReturnType<typeof repo.listOrganizations>>;
  try {
    const [s, listData, o] = await Promise.all([
      repo.summary(query.clientId),
      repo.list(query),
      repo.listOrganizations(),
    ]);
    summary = s;
    view = buildSignalListView(listData, query);
    orgs = o;
  } catch {
    return (
      <Alert tone="danger" title="We couldn't load signals">
        Something went wrong reading transformation data. <Link href={signalsHref(query)}>Try again</Link>.
      </Alert>
    );
  }

  const rows: Row[] = view.rows;

  const columns: OperationalColumn<Row>[] = [
    {
      key: "title",
      header: "Signal",
      label: "Signal",
      render: (r) => (
        <Link href={r.href} className={styles.rowLink}>
          <span className={styles.rowTitle}>{r.title}</span>
          {r.createdByName ? <span className={styles.rowSub}>by {r.createdByName}</span> : null}
        </Link>
      ),
    },
    { key: "org", header: "Organization", label: "Org", render: (r) => r.orgName },
    {
      key: "status",
      header: "Status",
      label: "Status",
      render: (r) => <Badge status={r.status}>{r.statusLabel}</Badge>,
    },
    {
      key: "source",
      header: "Source",
      label: "Source",
      hideOnMobile: true,
      render: (r) => <span className={styles.muted}>{r.source ?? "—"}</span>,
    },
    {
      key: "created",
      header: "Created",
      label: "Created",
      align: "end",
      render: (r) => (
        <time dateTime={r.createdAt} className={styles.muted}>
          {formatDate(r.createdAt)}
        </time>
      ),
    },
  ];

  return (
    <>
      <div className={styles.summary}>
        <MetricCard label="Open" value={summary.open} icon="activity" />
        <MetricCard label="Prioritized" value={summary.prioritized} icon="target" />
        <MetricCard label={`New (${SIGNAL_RECENT_DAYS}d)`} value={summary.recent} icon="sparkles" />
        <MetricCard label="Archived" value={summary.archived} icon="check-circle" />
      </div>

      <OperationalPanel>
        <FilterBar
          label="Filter signals"
          chips={<SignalsControls query={query} orgs={orgs} activeFilters={view.activeFilters} />}
        >
          <span className={styles.count}>
            {view.total.toLocaleString()} {view.total === 1 ? "signal" : "signals"}
          </span>
        </FilterBar>

        {rows.length === 0 ? (
          view.hasConstraints ? (
            <EmptyWorkspace
              icon="search"
              title="No signals match your filters"
              body="Try a different status or search term, or clear the active filters."
              action={
                <Button asChild variant="secondary">
                  <Link href="/admin/signals">Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyWorkspace
              icon="activity"
              title="No signals yet"
              body="A Signal is a detected change worth attention — the raw material of a transformation cycle. Capture the first one to begin."
              action={
                canWrite ? (
                  <Button asChild variant="primary">
                    <Link href="/admin/signals/new">Create Signal</Link>
                  </Button>
                ) : null
              }
            />
          )
        ) : (
          <>
            <OperationalTable
              caption="Signals, most recent first — each links to its detail page."
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
            />
            {view.pageCount > 1 ? (
              <Pagination
                page={view.page}
                pages={view.pageCount}
                hrefFor={(p) => signalsHref({ ...query, page: p })}
              />
            ) : null}
          </>
        )}
      </OperationalPanel>
    </>
  );
}

function SignalsSkeleton() {
  return (
    <div className={styles.workspace} aria-busy="true" aria-label="Loading signals">
      <div className={styles.summary}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} height="84px" radius="var(--radius-lg)" />
        ))}
      </div>
      <SkeletonBlock height="320px" radius="var(--radius-xl)" />
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
            title="You don't have access to Signals"
            body="Your role can't view the transformation command center. If this seems wrong, contact an administrator."
          />
        </OperationalPanel>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
