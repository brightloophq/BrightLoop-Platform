import { Badge, EmptyWorkspace, OperationalPanel, OperationalTable, SectionRule, type OperationalColumn } from "@brightloop/ui";
import { formatBytes, type DiscoveryPageView } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

/**
 * The per-page crawl ledger.
 *
 * `preview` is bounded, tag-free plain text produced by the view model and
 * rendered as a TEXT NODE — React escapes it, and no component in this sprint
 * uses `dangerouslySetInnerHTML`. Raw HTML is never stored, returned, or drawn.
 */
export function PageEvidenceTable({ pages }: { pages: DiscoveryPageView[] }) {
  if (pages.length === 0) {
    return (
      <OperationalPanel>
        <SectionRule index="04" label="Pages" meta="none" />
        <EmptyWorkspace icon="search" title="No pages recorded" body="The crawl produced no page records. Nothing is inferred for a page that was never fetched." />
      </OperationalPanel>
    );
  }

  const columns: OperationalColumn<DiscoveryPageView>[] = [
    {
      key: "page",
      header: "Page",
      label: "Page",
      render: (p) => (
        <span>
          <span className={styles.pageTitle}>{p.title ?? p.requestedUrl}</span>
          <br />
          <span className={styles.mono}>{p.finalUrl || p.requestedUrl}</span>
        </span>
      ),
    },
    { key: "kind", header: "Type", label: "Type", hideOnMobile: true, render: (p) => <span className={styles.mono}>{p.kind}</span> },
    {
      key: "status",
      header: "Status",
      label: "Status",
      render: (p) => (
        <span className={styles.badgeRow}>
          <Badge status={p.outcome === "ok" ? "active" : p.outcome === "excluded" ? "pending" : "failed"}>{p.outcome}</Badge>
          <span className={styles.mono}>{p.status ?? "—"}</span>
        </span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      label: "Reason",
      hideOnMobile: true,
      render: (p) => <span className={styles.mono}>{p.reason ?? (p.outcome === "ok" ? "—" : "unavailable")}</span>,
    },
    { key: "bytes", header: "Bytes", label: "Bytes", align: "end", hideOnMobile: true, render: (p) => <span className={styles.mono}>{formatBytes(p.bytes)}</span> },
    {
      key: "checksum",
      header: "Checksum",
      label: "Checksum",
      hideOnMobile: true,
      render: (p) => <span className={styles.mono}>{p.checksum ?? "—"}</span>,
    },
    {
      key: "preview",
      header: "Sanitized preview",
      label: "Preview",
      render: (p) =>
        p.preview === "" ? (
          <span className={styles.mono}>No content — {p.reason ?? "not fetched"}</span>
        ) : (
          <span className={styles.preview}>{p.preview}</span>
        ),
    },
  ];

  return (
    <OperationalPanel>
      <SectionRule index="04" label="Pages" meta={`${pages.length} recorded`} />
      <OperationalTable
        caption="Crawled pages with status, checksum and a bounded sanitized text preview."
        columns={columns}
        rows={pages}
        rowKey={(p) => p.targetId}
      />
      <div className={styles.railFoot}>
        <span>Previews are sanitized, bounded plain text</span>
        <span>Raw HTML is never stored or rendered</span>
      </div>
    </OperationalPanel>
  );
}
