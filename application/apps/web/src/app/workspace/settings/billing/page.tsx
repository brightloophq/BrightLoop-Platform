/**
 * Billing & Subscription (Phase F · Sprint F5). The workspace's commercial home:
 * current plan, current-period usage against entitlements, invoices, billing
 * history, and the plan catalogue (upgrade options). READ-only for the viewer —
 * subscription changes + payment methods are internal-managed (capability model).
 * No raw provider data is ever shown (the read models are DTO-only).
 */

import { Badge, EmptyState } from "@brightloop/ui";
import { toneFor } from "@brightloop/schema";
import { getActor } from "@/lib/auth";
import { loadBilling } from "@/lib/billing-data";
import styles from "../../pages.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing · Workspace" };

function money(cents: number | null, currency: string): string {
  if (cents === null) return "Custom";
  const value = (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency.toUpperCase()} ${value}`;
}

function meterLabel(meter: string): string {
  return meter.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function limitLabel(limit: number | null, unlimited: boolean): string {
  if (unlimited || limit === null) return "Unlimited";
  return limit.toLocaleString();
}

function date(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

export default async function BillingPage() {
  const actor = await getActor();
  if (actor === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;

  const data = await loadBilling();
  if (data === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;

  const { overview, invoices, history, plans } = data;
  const sub = overview?.subscription ?? null;
  const usage = overview?.usage ?? null;
  const account = overview?.account ?? null;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Billing &amp; Subscription</h1>
          <p className={styles.pageSub}>Your plan, usage, and invoices for this workspace.</p>
        </div>
        {sub !== null ? <Badge tone={toneFor(sub.status)}>{sub.status.replace(/_/g, " ")}</Badge> : null}
      </div>

      {sub === null ? (
        <EmptyState
          icon="credit-card"
          title="No active subscription"
          body="This workspace is not subscribed to a plan yet. Review the available plans below."
        />
      ) : (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTitle}>Subscription</span>
            <span className={styles.rowMeta}>{money(sub.priceCents, account?.currency ?? "usd")}{sub.priceCents !== null ? ` / ${sub.interval}` : ""}</span>
          </div>
          <div className={styles.list}>
            <div className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>{sub.planName}</div><div className={styles.rowMeta}>{sub.tier} · {sub.seats} seat(s)</div></div><div className={styles.rowRight}><Badge tone={toneFor(sub.status)}>{sub.status.replace(/_/g, " ")}</Badge></div></div>
            <div className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>Current period</div><div className={styles.rowMeta}>{date(sub.currentPeriodStartAt)} → {date(sub.currentPeriodEndAt)}</div></div></div>
            {sub.status === "trialing" ? <div className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>Trial ends</div><div className={styles.rowMeta}>{date(sub.trialEndAt)}</div></div></div> : null}
            {sub.gracePeriodEndAt !== null ? <div className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>Grace period ends</div><div className={styles.rowMeta}>{date(sub.gracePeriodEndAt)}</div></div></div> : null}
            {sub.discount !== null ? <div className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>Discount</div><div className={styles.rowMeta}>{sub.discount.code} · {sub.discount.type === "percent" ? `${sub.discount.value}%` : money(sub.discount.value, account?.currency ?? "usd")}</div></div></div> : null}
            {sub.cancelAtPeriodEnd ? <div className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>Cancellation</div><div className={styles.rowMeta}>Scheduled at period end</div></div></div> : null}
          </div>
        </section>
      )}

      {usage !== null ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}><span className={styles.sectionTitle}>Usage this period</span></div>
          <div className={styles.list}>
            {usage.meters.map((m) => (
              <div key={m.meter} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>{meterLabel(m.meter)}</div>
                  <div className={styles.progressTrack} aria-hidden>
                    <div className={styles.progressFill} style={{ width: `${Math.round(Math.min(1, m.utilization) * 100)}%` }} />
                  </div>
                </div>
                <div className={styles.rowRight}>
                  <div className={styles.rowMeta}>{m.used.toLocaleString()} / {limitLabel(m.limit, m.unlimited)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.section}>
        <div className={styles.sectionHead}><span className={styles.sectionTitle}>Invoices</span></div>
        <div className={styles.list}>
          {invoices.length === 0 ? <div className={styles.rowMeta}>No invoices yet.</div>
            : invoices.map((i) => (
              <div key={i.id} className={styles.row}>
                <div className={styles.rowMain}><div className={styles.rowTitle}>{i.number}</div><div className={styles.rowMeta}>{date(i.periodStartAt)} → {date(i.periodEndAt)}</div></div>
                <div className={styles.rowRight}><div className={styles.rowMeta}>{money(i.totalCents, i.currency)}</div><Badge tone={toneFor(i.status)}>{i.status}</Badge></div>
              </div>
            ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><span className={styles.sectionTitle}>Plans</span></div>
        <div className={styles.metricGrid}>
          {plans.map((p) => (
            <div key={p.id} className={styles.metric}>
              <div className={styles.metricLabel}>{p.name}{sub?.planId === p.id ? " · current" : ""}</div>
              <div className={styles.metricValue}>{money(p.priceCents, p.currency)}{p.priceCents !== null && p.interval !== "none" ? `/${p.interval}` : ""}</div>
              <div className={styles.rowMeta}>{p.seatsIncluded} seat(s){p.trialDays > 0 ? ` · ${p.trialDays}-day trial` : ""}</div>
            </div>
          ))}
        </div>
      </section>

      {history.length > 0 ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}><span className={styles.sectionTitle}>Billing history</span></div>
          <div className={styles.timeline}>
            {history.map((e) => (
              <div key={e.id} className={styles.tlRow}>
                <div className={styles.tlDot} />
                <div className={styles.tlBody}>
                  <div className={styles.tlType}>{e.type}</div>
                  <div className={styles.tlText}>{e.summary}</div>
                </div>
                <div className={styles.rowMeta}>{date(e.createdAt)}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
