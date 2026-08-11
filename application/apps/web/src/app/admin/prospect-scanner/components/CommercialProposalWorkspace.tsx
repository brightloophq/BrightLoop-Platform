"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Badge, Button, OperationalPanel, SectionRule } from "@brightloop/ui";
import { commercialBadgeStatus, formatMinor, type CommercialProposalView, type CommercialWorkItemView } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

/**
 * §09 — the INTERNAL admin PROPOSAL WORKSPACE.
 *
 * Reads the post-scan commercial DRAFT and lets an admin assign authoritative
 * pricing per recommended work item. Pricing is ADMIN-OWNED: the client only
 * captures the numbers; the server validates, computes the totals (integer minor
 * units) and supersedes the version — pricing NEVER approves. The live summary here
 * is a DISPLAY convenience; the persisted totals always come back from the server.
 * Evidence and recommendations are read-only — only commercial numbers are editable.
 */

type Kind = "one_time" | "recurring";
interface LineState {
  amount: string; // dollars, as typed
  kind: Kind;
  optional: boolean;
}

const initialLine = (w: CommercialWorkItemView): LineState => ({
  amount: w.amountMinor !== null ? (w.amountMinor / 100).toFixed(2) : "",
  kind: w.pricingType === "recurring" ? "recurring" : "one_time",
  optional: w.optional,
});

/** Parse a dollars string to integer minor units; blank/NaN → null (no line). */
function toMinor(amount: string): number | null {
  const t = amount.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function CommercialProposalWorkspace({ runId, proposal }: { runId: string; proposal: CommercialProposalView }) {
  const router = useRouter();
  const [lines, setLines] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(proposal.workItems.map((w) => [w.sourceId, initialLine(w)])),
  );
  const [currency] = useState(proposal.currency ?? "USD");
  const [notes, setNotes] = useState(proposal.commercialNotes);
  const [validDays, setValidDays] = useState(proposal.validUntil ? "" : "30");
  const [phase, setPhase] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const update = (sourceId: string, patch: Partial<LineState>) =>
    setLines((prev) => ({ ...prev, [sourceId]: { ...prev[sourceId]!, ...patch } }));

  // Live DISPLAY totals (server is authoritative on save).
  const totals = useMemo(() => {
    let oneTime = 0;
    let monthly = 0;
    for (const w of proposal.workItems) {
      const l = lines[w.sourceId]!;
      const minor = toMinor(l.amount);
      if (minor === null) continue;
      if (l.kind === "recurring") monthly += minor;
      else oneTime += minor;
    }
    return { oneTime, monthly };
  }, [lines, proposal.workItems]);

  if (!proposal.present) {
    return (
      <OperationalPanel tone="anchor">
        <SectionRule index="09" label="Proposal" meta="internal draft · commercial" />
        <div className={styles.badgeRow} style={{ marginBottom: "var(--space-3)" }}>
          <Badge status="pending">Not drafted</Badge>
        </div>
        <p className={styles.stageReason}>The commercial proposal draft appears automatically once the post-scan workflow runs on a completed scan.</p>
      </OperationalPanel>
    );
  }

  const save = async () => {
    setPhase("saving");
    setError(null);
    const items = proposal.workItems
      .map((w) => ({ w, l: lines[w.sourceId]!, minor: toMinor(lines[w.sourceId]!.amount) }))
      .filter(({ l, minor }) => minor !== null || l.optional)
      .map(({ w, l, minor }) => ({
        sourceId: w.sourceId,
        pricingType: l.kind,
        amountMinor: minor ?? 0,
        cadence: l.kind === "recurring" ? "monthly" : null,
        optional: l.optional,
      }));
    const validUntil = validDays.trim() === "" ? null : new Date(Date.now() + Number(validDays) * 86_400_000).toISOString().slice(0, 10);
    try {
      const res = await fetch("/api/internal/runtime/proposal-pricing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId, pricing: { currency, items, discountMinor: 0, validUntil, commercialNotes: notes } }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(res.status === 403 ? "You don't have permission to price this proposal." : body?.error?.message ?? `Could not save pricing (${res.status}).`);
        setPhase("error");
        return;
      }
      setPhase("saved");
      router.refresh();
    } catch {
      setError("Lost connection while saving. Try again.");
      setPhase("error");
    }
  };

  return (
    <OperationalPanel tone="anchor">
      <SectionRule index="09" label="Proposal" meta="internal workspace · admin pricing" />

      <div className={styles.badgeRow} style={{ marginBottom: "var(--space-3)" }}>
        <Badge status={proposal.draftReady ? "active" : commercialBadgeStatus(proposal.status)}>{proposal.generationLabel}</Badge>
        <Badge status={commercialBadgeStatus(proposal.status)}>{proposal.statusLabel}</Badge>
        <Badge status={proposal.needsPricing ? "pending" : "active"}>{proposal.needsPricing ? "Pricing required" : "Pricing complete"}</Badge>
      </div>

      {proposal.summary ? <p className={styles.stageReason} style={{ marginBottom: "var(--space-4)" }}>{proposal.summary}</p> : null}

      <div className={styles.pricingHeading}>
        <span className={styles.previewH2}>Set pricing · {proposal.workItemCount} recommended item{proposal.workItemCount === 1 ? "" : "s"}</span>
        <span className={styles.stageReason}>
          {proposal.needsPricing
            ? "Assign a price to each item, then Save. Pricing is admin-owned — never AI-generated."
            : "All required items are priced. Edit any amount and Save to create a new version."}
        </span>
      </div>

      <div className={styles.pricingScope}>
        {proposal.workItems.map((w) => {
          const l = lines[w.sourceId]!;
          return (
            <div key={w.sourceId} className={styles.pricingRow}>
              <div className={styles.pricingWork}>
                <div className={styles.pricingWorkHead}>
                  <span className={styles.summaryValue}>{w.title}</span>
                  <Badge status="idle">{w.priority}</Badge>
                </div>
                {w.reason ? <span className={styles.stageReason}>{w.reason}</span> : null}
              </div>
              <div className={styles.pricingControls}>
                <label className={styles.pricingField}>
                  <span className={styles.summaryKey}>Amount ({currency})</span>
                  <input
                    className={styles.pricingInput}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={l.amount}
                    onChange={(e) => update(w.sourceId, { amount: e.target.value })}
                    aria-label={`Amount for ${w.title}`}
                  />
                </label>
                <label className={styles.pricingField}>
                  <span className={styles.summaryKey}>Type</span>
                  <select className={styles.pricingInput} value={l.kind} onChange={(e) => update(w.sourceId, { kind: e.target.value as Kind })} aria-label={`Pricing type for ${w.title}`}>
                    <option value="one_time">One-time</option>
                    <option value="recurring">Monthly</option>
                  </select>
                </label>
                <label className={styles.pricingCheck}>
                  <input type="checkbox" checked={l.optional} onChange={(e) => update(w.sourceId, { optional: e.target.checked })} />
                  <span className={styles.summaryKey}>Optional</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.pricingSummary}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryKey}>One-time total</span>
          <span className={styles.summaryValue}>{formatMinor(totals.oneTime, currency)}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryKey}>Monthly total</span>
          <span className={styles.summaryValue}>{totals.monthly > 0 ? `${formatMinor(totals.monthly, currency)}/mo` : "—"}</span>
        </div>
        <label className={styles.pricingField}>
          <span className={styles.summaryKey}>Valid for (days)</span>
          <input className={styles.pricingInput} inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value)} aria-label="Proposal validity in days" />
        </label>
      </div>

      <label className={styles.pricingField} style={{ marginTop: "var(--space-3)" }}>
        <span className={styles.summaryKey}>Commercial notes (client-facing)</span>
        <textarea className={styles.pricingInput} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Commercial notes" />
      </label>

      <div className={styles.controls} style={{ marginTop: "var(--space-4)" }}>
        <Button variant="primary" onClick={save} disabled={phase === "saving"} loading={phase === "saving"}>
          {phase === "saving" ? "Saving…" : "Save pricing"}
        </Button>
        <Link href={`/admin/prospect-scanner/${runId}/proposal-preview`} className={styles.previewLink}>
          Preview proposal →
        </Link>
      </div>

      {phase === "saved" ? (
        <div style={{ marginTop: "var(--space-3)" }} aria-live="polite">
          <Alert tone="success" title="Pricing saved">The proposal now reflects your pricing. Approve it in the Prospect package — nothing is sent.</Alert>
        </div>
      ) : null}
      {phase === "error" && error ? (
        <div style={{ marginTop: "var(--space-3)" }} role="alert">
          <Alert tone="danger" title="Couldn’t save pricing">{error}</Alert>
        </div>
      ) : null}

      <div className={styles.railFoot}>
        <span>Pricing is admin-owned · never AI-generated · totals computed server-side</span>
        <span>Saving pricing does not approve or send the proposal</span>
      </div>
    </OperationalPanel>
  );
}
