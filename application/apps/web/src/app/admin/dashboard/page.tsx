import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AuthorizationError,
  assertDashboardRead,
  resolveDashboardScope,
  buildDashboardView,
  buildSystemMapView,
  buildPortfolioSystemMapView,
  type DashboardScope,
  type DashboardView,
} from "@brightloop/domain";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Icon,
  SectionHeader,
  OperationalPanel,
  MetricCard,
  PipelineNode,
  AttentionRow,
  SkeletonBlock,
  SystemMap,
} from "@brightloop/ui";
import { MotionProvider, DashboardEntrance, AnimatedMetric, PipelineAnimation } from "@brightloop/ui/motion";
import { requireSurface } from "@/lib/auth";
import { getTransformationDashboardRepository, getCoreSurfaceRepository } from "@/lib/repositories";
import { createClient } from "@/lib/supabase/server";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Console · Auxion" };

const METRIC_ICON: Record<string, string> = {
  health: "gauge",
  index: "target",
  "open-signals": "activity",
  insights: "lightbulb",
  recommendations: "sparkles",
  "awaiting-approval": "check-circle",
  "moves-in-progress": "git-branch",
  "moves-completed": "check-circle",
};

const ATTENTION_ICON: Record<string, string> = {
  "pending-approvals": "check-circle",
  "critical-risks": "bell",
  "blocked-executions": "activity",
  "stale-recommendations": "clock",
};

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

export default async function DashboardPage() {
  const actor = await requireSurface("admin");

  try {
    assertDashboardRead(actor);
  } catch (err) {
    if (err instanceof AuthorizationError) return <Unauthorized />;
    throw err;
  }

  const scope = resolveDashboardScope(actor);

  return (
    <div className={styles.page}>
      <MotionProvider>
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardData scope={scope} />
        </Suspense>
      </MotionProvider>
    </div>
  );
}

/* ---- data (streamed behind Suspense) -------------------------------------- */

async function DashboardData({ scope }: { scope: DashboardScope }) {
  const orgName = await resolveOrgName(scope);

  let view: DashboardView;
  try {
    const repo = await getTransformationDashboardRepository();
    view = buildDashboardView(await repo.read(scope), scope);
  } catch {
    return <DashboardError />;
  }

  const hero = view.metrics.filter((m) => m.key === "health" || m.key === "index");
  const counts = view.metrics.filter((m) => m.key !== "health" && m.key !== "index");

  return (
    <DashboardEntrance className={styles.canvas}>
      {/* ── Zone 1 · Executive overview ─────────────────────────────── */}
      <div data-animate="header">
        <SectionHeader
          as="h1"
          size="page"
          index="01"
          kicker={`System state · ${orgName}`}
          title={timeGreeting(new Date().getHours())}
          hint={
            scope.kind === "portfolio"
              ? "Your transformation portfolio at a glance — signals through learnings across every organization."
              : `How ${orgName} is transforming — the full loop from signal to learning.`
          }
          action={
            <>
              <Button asChild variant="ghost">
                <Link href="/admin/measurements">Business Health</Link>
              </Button>
              <Button asChild variant="primary">
                <Link href="/admin/signals">Create Signal</Link>
              </Button>
            </>
          }
        />
      </div>

      <ConsoleSystemMap scope={scope} />

      <div className={styles.overview}>
        <div className={styles.heroGrid}>
          {hero.map((m) => (
            <AnimatedMetric key={m.key}>
              <MetricCard
                emphasis="hero"
                icon={METRIC_ICON[m.key]}
                label={m.label}
                value={m.value}
                suffix={m.suffix}
                caption={scope.kind === "portfolio" ? "Portfolio average" : undefined}
              />
            </AnimatedMetric>
          ))}
        </div>

        <div className={styles.countGrid}>
          {counts.map((m) => {
            const card = (
              <MetricCard
                interactive={Boolean(m.href)}
                icon={METRIC_ICON[m.key]}
                label={m.label}
                value={m.value}
                suffix={m.suffix}
              />
            );
            return (
              <AnimatedMetric key={m.key}>
                {m.href ? (
                  <Link
                    href={m.href}
                    className={styles.cardLink}
                    aria-label={`${m.label}: ${m.value === null ? "no data yet" : m.value.toLocaleString()}`}
                  >
                    {card}
                  </Link>
                ) : (
                  card
                )}
              </AnimatedMetric>
            );
          })}
        </div>
      </div>

      {/* ── Zone 2 · Transformation loop (the anchor) ───────────────── */}
      <OperationalPanel tone="anchor">
        <SectionHeader
          index="02"
          kicker="The transformation loop"
          title="Pipeline"
          hint="Signal → Insight → Recommendation → Approval → Move → Execution → Measurement → Learning"
        />
        <PipelineAnimation className={styles.loop}>
          {view.pipeline.map((stage, i) => {
            const position =
              view.pipeline.length === 1
                ? "only"
                : i === 0
                  ? "first"
                  : i === view.pipeline.length - 1
                    ? "last"
                    : "middle";
            const node = (
              <PipelineNode
                label={stage.label}
                count={stage.count}
                position={position}
                interactive={Boolean(stage.href)}
              />
            );
            return (
              <PipelineAnimation.Node key={stage.key} className={styles.loopNode}>
                {stage.href ? (
                  <Link
                    href={stage.href}
                    className={styles.nodeLink}
                    aria-label={`${stage.label}: ${stage.count.toLocaleString()}`}
                  >
                    {node}
                  </Link>
                ) : (
                  node
                )}
              </PipelineAnimation.Node>
            );
          })}
        </PipelineAnimation>
      </OperationalPanel>

      {/* ── Zone 3 · Operational feed ───────────────────────────────── */}
      <div className={styles.feed}>
        <div className={styles.feedCol} data-animate="attention">
          <OperationalPanel>
            <SectionHeader index="03" title="Attention required" />
            {view.attentionClear ? (
              <EmptyState
                icon="check-circle"
                title="All clear"
                body="Nothing needs your attention right now — approvals, risks and executions are all healthy."
              />
            ) : (
              <div className={styles.list}>
                {view.attention.map((item) => {
                  const row = (
                    <AttentionRow
                      label={item.label}
                      count={item.count}
                      tone={item.tone}
                      icon={ATTENTION_ICON[item.key]}
                      interactive={Boolean(item.href)}
                    />
                  );
                  return item.href ? (
                    <Link key={item.key} href={item.href} className={styles.rowLink}>
                      {row}
                    </Link>
                  ) : (
                    <div key={item.key}>{row}</div>
                  );
                })}
              </div>
            )}
          </OperationalPanel>
        </div>

        <div className={styles.feedCol} data-animate="activity">
          <OperationalPanel>
            <SectionHeader index="04" title="Recent activity" />
            <Activity view={view} />
          </OperationalPanel>
        </div>
      </div>

      {/* Quick access strip */}
      <section data-animate="activity">
        <SectionHeader index="05" title="Jump to" />
        <div className={styles.quick}>
          {QUICK.map((q) => (
            <Link key={q.href} href={q.href} className={styles.quickCard}>
              <span className={styles.quickIcon}>
                <Icon name={q.icon} size={16} />
              </span>
              {q.label}
            </Link>
          ))}
        </div>
      </section>
    </DashboardEntrance>
  );
}

/**
 * The canonical System Map on the Console. Scope-aware: an organization shows its
 * own seven domains; portfolio scope aggregates across every org. Reuses the
 * existing dashboard read-model architecture (no dashboard section is rebuilt),
 * and never breaks the Console if domain data is unavailable.
 */
async function ConsoleSystemMap({ scope }: { scope: DashboardScope }) {
  try {
    const repo = await getCoreSurfaceRepository();
    const map =
      scope.kind === "organization"
        ? buildSystemMapView(await repo.listDomains(scope.clientId))
        : buildPortfolioSystemMapView(await repo.listAllDomains());
    return (
      <OperationalPanel tone="anchor">
        <SectionHeader
          kicker="System state"
          title="System Map"
          hint={
            scope.kind === "portfolio"
              ? "Domains across your portfolio — the Index climbs as each node goes Live."
              : "Seven domains assembled into one operating System."
          }
        />
        <div className={styles.systemMap} data-animate="attention">
          <SystemMap nodes={map.nodes} index={map.index} size={320} />
        </div>
      </OperationalPanel>
    );
  } catch {
    return null; // never break the Console over the System Map
  }
}

function Activity({ view }: { view: DashboardView }) {
  const now = Date.now();
  if (view.activity.length === 0) {
    return (
      <EmptyState
        icon="clock"
        title="No activity yet"
        body="State transitions across the transformation loop will appear here as work moves."
      />
    );
  }
  return (
    <div className={styles.list}>
      {view.activity.map((item) => {
        const href = SECTION_FOR_ENTITY[item.entity];
        const desc = `${item.from ? `${item.from} → ` : ""}${item.to}`;
        const meta = `${capitalize(item.entity)} · ${item.actor ?? "system"}`;
        const inner = (
          <div className={styles.actRow}>
            <div className={styles.actMain}>
              <span className={styles.actTitle}>{desc}</span>
              <span className={styles.actMeta}>{meta}</span>
            </div>
            <Badge status={item.to} />
            <span className={styles.actTime}>{timeAgo(item.at, now)}</span>
          </div>
        );
        return href ? (
          <Link key={item.id} href={href} className={styles.rowLink}>
            {inner}
          </Link>
        ) : (
          <div key={item.id}>{inner}</div>
        );
      })}
    </div>
  );
}

const QUICK = [
  { label: "Signals", href: "/admin/signals", icon: "activity" },
  { label: "Recommendations", href: "/admin/recommendations", icon: "sparkles" },
  { label: "Approvals", href: "/admin/approvals", icon: "check-circle" },
  { label: "Moves", href: "/admin/moves", icon: "git-branch" },
  { label: "Business Health", href: "/admin/measurements", icon: "gauge" },
  { label: "Knowledge", href: "/admin/knowledge", icon: "book-open" },
] as const;

/* ---- loading / states ----------------------------------------------------- */

function DashboardSkeleton() {
  return (
    <div className={styles.canvas} aria-busy="true" aria-label="Loading dashboard">
      <div className={styles.overview}>
        <div className={styles.heroGrid}>
          <SkeletonBlock height="128px" radius="var(--radius-lg)" />
          <SkeletonBlock height="128px" radius="var(--radius-lg)" />
        </div>
        <div className={styles.countGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} height="94px" radius="var(--radius-lg)" />
          ))}
        </div>
      </div>
      <SkeletonBlock height="180px" radius="var(--radius-xl)" />
      <div className={styles.feed}>
        <SkeletonBlock height="260px" radius="var(--radius-xl)" />
        <SkeletonBlock height="260px" radius="var(--radius-xl)" />
      </div>
    </div>
  );
}

function Unauthorized() {
  return (
    <div className={styles.page}>
      <div className={styles.stateWrap}>
        <OperationalPanel>
          <EmptyState
            icon="lock"
            title="You don't have access to the dashboard"
            body="Your role can't view the transformation command center. If this seems wrong, contact an administrator."
          />
        </OperationalPanel>
      </div>
    </div>
  );
}

function DashboardError() {
  return (
    <div className={styles.stateWrap}>
      <Alert tone="danger" title="We couldn't load your dashboard">
        Something went wrong reading transformation data. <Link href="/admin/dashboard">Try again</Link>.
      </Alert>
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
