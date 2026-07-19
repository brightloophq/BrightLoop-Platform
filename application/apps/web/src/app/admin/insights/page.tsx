import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AuthorizationError,
  assertInsightsRead,
  canWriteInsights,
  parseInsightListQuery,
  buildInsightListView,
  insightsHref,
  INSIGHT_RECENT_DAYS,
  type InsightListQuery,
  type ConfidenceBand,
} from "@brightloop/domain";
import {
  Alert,
  Badge,
  Button,
  ConfidenceMeter,
  EmptyWorkspace,
  FilterBar,
  Icon,
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
import { getInsightsRepository } from "@/lib/repositories";
import { InsightsControls } from "./InsightsControls";
import styles from "./insights.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Insights · Auxion" };

type RawParams = Record<string, string | string[] | undefined>;

interface Row {
  id: string;
  summary: string;
  status: string;
  statusLabel: string;
  orgName: string;
  signalTitle: string;
  signalHref: string;
  confidencePercent: number | null;
  confidenceBand: ConfidenceBand;
  confidenceBandLabel: string;
  createdByName: string | null;
  createdAt: string;
  href: string;
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const actor = await requireSurface("admin");
  try {
    assertInsightsRead(actor);
  } catch (err) {
    if (err instanceof AuthorizationError) return <Unauthorized />;
    throw err;
  }

  const query = parseInsightListQuery(await searchParams);
  const canWrite = canWriteInsights(actor);

  return (
    <div className={styles.page}>
      <MotionProvider>
        <div className={styles.canvas}>
          <SectionHeader
            as="h1"
            size="page"
            kicker="Transformation"
            title="Insights"
            hint="What the signals mean — the interpretation surface of the transformation cycle."
            action={
              canWrite ? (
                <Button asChild variant="primary">
                  <Link href="/admin/insights/new">Create Insight</Link>
                </Button>
              ) : null
            }
          />
          <Suspense key={insightsHref(query)} fallback={<InsightsSkeleton />}>
            <InsightsWorkspace query={query} canWrite={canWrite} />
          </Suspense>
        </div>
      </MotionProvider>
    </div>
  );
}

async function InsightsWorkspace({ query, canWrite }: { query: InsightListQuery; canWrite: boolean }) {
  const repo = await getInsightsRepository();

  let summary: Awaited<ReturnType<typeof repo.summary>>;
  let view: ReturnType<typeof buildInsightListView>;
  let orgs: Awaited<ReturnType<typeof repo.listOrganizations>>;
  try {
    const [s, listData, o] = await Promise.all([
      repo.summary(query.clientId),
      repo.list(query),
      repo.listOrganizations(),
    ]);
    summary = s;
    view = buildInsightListView(listData, query);
    orgs = o;
  } catch {
    return (
      <Alert tone="danger" title="We couldn't load insights">
        Something went wrong reading transformation data. <Link href={insightsHref(query)}>Try again</Link>.
      </Alert>
    );
  }

  const rows: Row[] = view.rows;

  const columns: OperationalColumn<Row>[] = [
    {
      key: "summary",
      header: "Insight",
      label: "Insight",
      render: (r) => (
        <Link href={r.href} className={styles.rowLink}>
          <span className={styles.rowTitle}>{r.summary}</span>
          {r.createdByName ? <span className={styles.rowSub}>by {r.createdByName}</span> : null}
        </Link>
      ),
    },
    { key: "org", header: "Organization", label: "Org", render: (r) => r.orgName },
    {
      key: "signal",
      header: "From signal",
      label: "Signal",
      hideOnMobile: true,
      render: (r) => (
        <Link href={r.signalHref} className={styles.signalLink}>
          <Icon name="activity" size={14} />
          <span>{r.signalTitle}</span>
        </Link>
      ),
    },
    {
      key: "confidence",
      header: "Confidence",
      label: "Confidence",
      render: (r) => (
        <div className={styles.confidenceCell}>
          <ConfidenceMeter
            percent={r.confidencePercent}
            band={r.confidenceBand}
            bandLabel={r.confidenceBandLabel}
            size="sm"
          />
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      label: "Status",
      render: (r) => <Badge status={r.status}>{r.statusLabel}</Badge>,
    },
    {
      key: "created",
      header: "Created",
      label: "Created",
      align: "end",
      hideOnMobile: true,
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
        <MetricCard label="Open" value={summary.open} icon="lightbulb" />
        <MetricCard label="Endorsed" value={summary.endorsed} icon="check-circle" />
        <MetricCard label={`New (${INSIGHT_RECENT_DAYS}d)`} value={summary.recent} icon="sparkles" />
        <MetricCard label="Dismissed" value={summary.dismissed} icon="x" />
      </div>

      <OperationalPanel>
        <FilterBar
          label="Filter insights"
          chips={<InsightsControls query={query} orgs={orgs} activeFilters={view.activeFilters} />}
        >
          <span className={styles.count}>
            {view.total.toLocaleString()} {view.total === 1 ? "insight" : "insights"}
          </span>
        </FilterBar>

        {rows.length === 0 ? (
          view.hasConstraints ? (
            <EmptyWorkspace
              icon="search"
              title="No insights match your filters"
              body="Try a different status or search term, or clear the active filters."
              action={
                <Button asChild variant="secondary">
                  <Link href="/admin/insights">Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyWorkspace
              icon="lightbulb"
              title="No insights yet"
              body="An Insight interprets a Signal — what a detected change actually means. Interpret the first signal to begin."
              action={
                canWrite ? (
                  <Button asChild variant="primary">
                    <Link href="/admin/insights/new">Create Insight</Link>
                  </Button>
                ) : null
              }
            />
          )
        ) : (
          <>
            <OperationalTable
              caption="Insights, most recent first — each links to its detail page."
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
            />
            {view.pageCount > 1 ? (
              <Pagination
                page={view.page}
                pages={view.pageCount}
                hrefFor={(p) => insightsHref({ ...query, page: p })}
              />
            ) : null}
          </>
        )}
      </OperationalPanel>
    </>
  );
}

function InsightsSkeleton() {
  return (
    <div className={styles.workspace} aria-busy="true" aria-label="Loading insights">
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
            title="You don't have access to Insights"
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
