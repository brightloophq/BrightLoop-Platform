import { Alert, EmptyWorkspace, MetricCard, OperationalPanel, SectionRule } from "@brightloop/ui";
import { formatBytes, formatDuration, type DiscoveryView } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

export interface DiscoverySummaryProps {
  discovery: DiscoveryView;
  crawlerEnabled: boolean;
}

/** The C3 crawl instrument panel — planned vs fetched vs blocked, and why. */
export function DiscoverySummary({ discovery, crawlerEnabled }: DiscoverySummaryProps) {
  if (!discovery.present) {
    return (
      <OperationalPanel>
        <SectionRule index="03" label="Discovery" meta="not run" />
        <EmptyWorkspace
          title="Discovery hasn't run yet"
          body={
            crawlerEnabled
              ? "Execute the discovery stages to crawl the prospect's public website. Nothing is fetched until you do."
              : "The crawler is disabled, so no page will be fetched. Enable AUXION_CRAWLER_ENABLED on the server first."
          }
        />
      </OperationalPanel>
    );
  }

  return (
    <OperationalPanel>
      <SectionRule index="03" label="Discovery" meta={`${discovery.fetched} of ${discovery.planned} fetched`} />

      <div className={styles.metrics}>
        <MetricCard label="Planned" value={discovery.planned} />
        <MetricCard label="Fetched" value={discovery.fetched} emphasis="hero" />
        <MetricCard label="Excluded" value={discovery.excluded} />
        <MetricCard label="Robots blocked" value={discovery.robotsBlocked} />
        <MetricCard label="SSRF blocked" value={discovery.ssrfBlocked} />
        <MetricCard label="Failed" value={discovery.failed} />
        <MetricCard label="Bytes fetched" value={formatBytes(discovery.bytesFetched)} />
        <MetricCard label="Redirects" value={discovery.redirectCount} />
        <MetricCard label="Crawl duration" value={formatDuration(discovery.durationMs)} />
      </div>

      {discovery.contentTypes.length > 0 ? (
        <div className={styles.switches} style={{ marginTop: "var(--space-4)" }}>
          {discovery.contentTypes.map((c) => (
            <span key={c.type} className={styles.switch}>
              {c.type} · {c.count}
            </span>
          ))}
          <span className={styles.switch}>robots.txt · {discovery.robotsFetched ? "read" : "absent"}</span>
        </div>
      ) : null}

      {discovery.injectionFlaggedPages > 0 ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          <Alert tone="warning" title="Prompt-injection phrasing detected">
            {discovery.injectionFlaggedPages} page(s) contained text addressed at an AI model. It is recorded as page DATA and is never treated as an
            instruction — no action is required.
          </Alert>
        </div>
      ) : null}

      {discovery.fetched === 0 ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          <Alert tone="warning" title="No page was fetched">
            The crawl completed but returned no usable page. Check the per-page reasons below before advancing — reasoning stays blocked until at least
            one page is observed.
          </Alert>
        </div>
      ) : null}
    </OperationalPanel>
  );
}
