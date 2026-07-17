import type { Metadata } from "next";
import Link from "next/link";
import {
  AuthorizationError,
  assertDashboardRead,
  resolveDashboardScope,
  buildDashboardView,
  type DashboardScope,
  type DashboardView,
} from "@brightloop/domain";
import { Alert, Badge, Button, EmptyState, Icon } from "@brightloop/ui";
import { MotionProvider, DashboardEntrance, AnimatedMetric, PipelineAnimation } from "@brightloop/ui/motion";
import { requireSurface } from "@/lib/auth";
import { getTransformationDashboardRepository } from "@/lib/repositories";
import { createClient } from "@/lib/supabase/server";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard · Auxion" };

export default async function DashboardPage() {
  const actor = await requireSurface("admin");

  // Authorization (defence-in-depth; RLS is the real boundary).
  try {
    assertDashboardRead(actor);
  } catch (err) {
    if (err instanceof AuthorizationError) return <Unauthorized />;
    throw err;
  }

  const scope = resolveDashboardScope(actor);
  const orgName = await resolveOrgName(scope);

  // Read the snapshot; a failure renders a recoverable error, never a broken page.
  let view: DashboardView;
  try {
    const repo = await getTransformationDashboardRepository();
    const snapshot = await repo.read(scope);
    view = buildDashboardView(snapshot, scope);
  } catch {
    return <DashboardError />;
  }

  return (
    <MotionProvider>
      <DashboardEntrance className={styles.wrap}>
        <Header orgName={orgName} scope={scope} />
        <Metrics view={view} />
        <Pipeline view={view} />
        <Attention view={view} />
        <Activity view={view} />
        <QuickAccess />
        {view.isEmpty ? <EmptyBanner /> : null}
      </DashboardEntrance>
    </MotionProvider>
  );
}

/* ---- header --------------------------------------------------------------- */

function Header({ orgName, scope }: { orgName: string; scope: DashboardScope }) {
  const greeting = timeGreeting(new Date().getHours());
  const lede =
    scope.kind === "portfolio"
      ? "Your transformation portfolio at a glance — signals through learnings across every organization."
      : `How ${orgName} is transforming — the full cycle from signal to learning.`;
  return (
    <header className={styles.header} data-animate="header">
      <div className={styles.headingBlock}>
        <span className={styles.eyebrow}>{orgName}</span>
        <h1 className={styles.title}>{greeting}</h1>
        <p className={styles.lede}>{lede}</p>
      </div>
      <div className={styles.headerActions}>
        <Button asChild variant="ghost">
          <Link href="/admin/measurements">Business Health</Link>
        </Button>
        <Button asChild variant="primary">
          <Link href="/admin/signals">Create Signal</Link>
        </Button>
      </div>
    </header>
  );
}

/* ---- executive metrics ---------------------------------------------------- */

function Metrics({ view }: { view: DashboardView }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Executive metrics</h2>
      </div>
      <div className={styles.metrics}>
        {view.metrics.map((metric) => {
          const body = (
            <>
              <span className={styles.metricLabel}>{metric.label}</span>
              {metric.value === null ? (
                <span className={styles.metricEmpty}>No data yet</span>
              ) : (
                <span className={styles.metricValue}>
                  {metric.value.toLocaleString()}
                  {metric.suffix ? <span className={styles.metricSuffix}>{metric.suffix}</span> : null}
                </span>
              )}
            </>
          );
          return (
            <AnimatedMetric key={metric.key}>
              {metric.href ? (
                <Link href={metric.href} className={styles.metricCard}>
                  {body}
                </Link>
              ) : (
                <div className={styles.metricCard}>{body}</div>
              )}
            </AnimatedMetric>
          );
        })}
      </div>
    </section>
  );
}

/* ---- transformation pipeline ---------------------------------------------- */

function Pipeline({ view }: { view: DashboardView }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Transformation pipeline</h2>
        <span className={styles.sectionHint}>Signal → Insight → Recommendation → Approval → Move → Execution → Measurement → Learning</span>
      </div>
      <PipelineAnimation className={styles.pipeline}>
        {view.pipeline.map((stage, i) => (
          <PipelineAnimation.Node key={stage.key}>
            <div style={{ display: "flex", alignItems: "center" }}>
              {stage.href ? (
                <Link href={stage.href} className={styles.pipelineNode}>
                  <span className={styles.pipelineCount}>{stage.count.toLocaleString()}</span>
                  <span className={styles.pipelineStage}>{stage.label}</span>
                </Link>
              ) : (
                <div className={styles.pipelineNode}>
                  <span className={styles.pipelineCount}>{stage.count.toLocaleString()}</span>
                  <span className={styles.pipelineStage}>{stage.label}</span>
                </div>
              )}
              {i < view.pipeline.length - 1 ? (
                <span className={styles.pipelineArrow} aria-hidden="true">
                  <Icon name="chevron-right" size={16} />
                </span>
              ) : null}
            </div>
          </PipelineAnimation.Node>
        ))}
      </PipelineAnimation>
    </section>
  );
}

/* ---- attention required --------------------------------------------------- */

function Attention({ view }: { view: DashboardView }) {
  return (
    <section className={styles.section} data-animate="attention">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Attention required</h2>
      </div>
      {view.attentionClear ? (
        <div className={styles.banner}>
          <EmptyState icon="check-circle" title="All clear" body="Nothing needs your attention right now — approvals, risks and executions are all healthy." />
        </div>
      ) : (
        <div className={styles.list}>
          {view.attention.map((item) => {
            const dot = [
              styles.rowDot,
              item.tone === "danger" ? styles.dotDanger : item.tone === "warning" ? styles.dotWarning : styles.dotInfo,
            ].join(" ");
            const inner = (
              <>
                <span className={dot} aria-hidden="true" />
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>{item.label}</span>
                </div>
                <span className={styles.rowCount}>{item.count.toLocaleString()}</span>
              </>
            );
            return item.href ? (
              <Link key={item.key} href={item.href} className={styles.row}>
                {inner}
              </Link>
            ) : (
              <div key={item.key} className={styles.row}>
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---- recent activity ------------------------------------------------------ */

const SECTION_FOR_ENTITY: Record<string, string> = {
  signal: "/admin/signals",
  insight: "/admin/insights",
  recommendation: "/admin/recommendations",
  approval: "/admin/approvals",
  move: "/admin/moves",
  execution: "/admin/moves",
  measurement: "/admin/measurements",
  learning: "/admin/measurements",
  knowledge: "/admin/knowledge",
};

function Activity({ view }: { view: DashboardView }) {
  const now = Date.now();
  return (
    <section className={styles.section} data-animate="activity">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Recent activity</h2>
      </div>
      {view.activity.length === 0 ? (
        <div className={styles.banner}>
          <EmptyState icon="clock" title="No activity yet" body="State transitions across the transformation cycle will appear here as work moves." />
        </div>
      ) : (
        <div className={styles.list}>
          {view.activity.map((item) => {
            const href = SECTION_FOR_ENTITY[item.entity];
            const desc = `${item.from ? `${item.from} → ` : ""}${item.to}`;
            const meta = `${capitalize(item.entity)} · ${item.actor ?? "system"}`;
            const inner = (
              <>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>{desc}</span>
                  <span className={styles.rowMeta}>{meta}</span>
                </div>
                <Badge status={item.to} />
                <span className={styles.rowTime}>{timeAgo(item.at, now)}</span>
              </>
            );
            return href ? (
              <Link key={item.id} href={href} className={styles.row}>
                {inner}
              </Link>
            ) : (
              <div key={item.id} className={styles.row}>
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---- quick access --------------------------------------------------------- */

const QUICK = [
  { label: "Review Signals", href: "/admin/signals", icon: "activity" },
  { label: "Recommendations", href: "/admin/recommendations", icon: "sparkles" },
  { label: "Approvals", href: "/admin/approvals", icon: "check-circle" },
  { label: "Moves", href: "/admin/moves", icon: "git-branch" },
  { label: "Business Health", href: "/admin/measurements", icon: "gauge" },
  { label: "Knowledge", href: "/admin/knowledge", icon: "book-open" },
] as const;

function QuickAccess() {
  return (
    <section className={styles.section} data-animate="activity">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Quick access</h2>
      </div>
      <div className={styles.quick}>
        {QUICK.map((q) => (
          <Link key={q.href} href={q.href} className={styles.quickCard}>
            <span className={styles.quickIcon}>
              <Icon name={q.icon} size={18} />
            </span>
            {q.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ---- states --------------------------------------------------------------- */

function Unauthorized() {
  return (
    <div className={styles.wrap}>
      <div className={styles.banner}>
        <EmptyState
          icon="lock"
          title="You don't have access to the dashboard"
          body="Your role can't view the transformation command center. If this seems wrong, contact an administrator."
        />
      </div>
    </div>
  );
}

function DashboardError() {
  return (
    <div className={styles.wrap}>
      <Alert tone="danger" title="We couldn't load your dashboard">
        Something went wrong reading transformation data.{" "}
        <Link href="/admin/dashboard">Try again</Link>.
      </Alert>
    </div>
  );
}

function EmptyBanner() {
  return (
    <div className={styles.banner} data-animate="activity">
      <EmptyState
        icon="rocket"
        title="Your transformation starts here"
        body="No signals have been captured yet. Once work begins, this dashboard fills with live metrics, pipeline progress and activity."
      />
    </div>
  );
}

/* ---- helpers -------------------------------------------------------------- */

async function resolveOrgName(scope: DashboardScope): Promise<string> {
  if (scope.kind === "portfolio") return "All organizations";
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("company").eq("id", scope.clientId).maybeSingle();
  return data?.company ?? "Your organization";
}

function timeGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

function timeAgo(iso: string, nowMs: number): string {
  const diff = Math.max(0, nowMs - Date.parse(iso));
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
