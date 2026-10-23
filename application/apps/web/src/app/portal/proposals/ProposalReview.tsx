"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@brightloop/ui";
import { proposalAction } from "../../portal-sales-actions";

export interface ProposalLine { label: string; amount?: number; quantity?: number; unitAmountMinor?: number; description?: string; pricingType?: string; cadence?: string | null }
export interface PortalProposal {
  id: string;
  status: string;
  subtotal: number;
  total: number;
  deposit: number;
  currency: string;
  discountMinor: number;
  validUntil: string | null;
  snapshotChecksum?: string;
  isCurrent?: boolean;
  line_items: ProposalLine[];
  clientSnapshot?: {
    proposal?: {
      executiveSummary?: string | null; observedSituation?: string | null;
      keyIssues?: { title?: string; detail?: string }[];
      opportunities?: { title?: string; detail?: string }[];
      proposedNextStep?: string | null;
    };
    narrative?: { key?: string; heading?: string; paragraphs?: string[] }[];
  };
}

const money = (cents: number, currency: string) => {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100); }
  catch { return `${currency} ${(cents / 100).toFixed(2)}`; }
};
const TONE: Record<string, "warning" | "success" | "danger" | "neutral"> = {
  sent: "warning", viewed: "warning", accepted: "success", change_requested: "neutral", revised: "warning", expired: "neutral",
};
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "var(--space-3)", padding: "2px 0", fontSize: "var(--fs-sm)" };

/** Client proposal review — accept or request changes. Draft proposals never reach here (RLS). */
export function ProposalReview({ proposals }: { proposals: PortalProposal[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingAcceptance, setConfirmingAcceptance] = useState<string | null>(null);
  const [requestingChanges, setRequestingChanges] = useState<string | null>(null);
  const [changeNote, setChangeNote] = useState("");

  // Mark sent proposals viewed on open.
  useEffect(() => {
    const unseen = proposals.filter((p) => p.status === "sent");
    if (unseen.length === 0) return;
    (async () => { for (const p of unseen) await proposalAction(p.id, "view"); router.refresh(); })();
    // Keyed on id:status so it re-runs only when a proposal is added or changes.
  }, [proposals.map((p) => `${p.id}:${p.status}`).join(",")]);

  async function act(proposal: PortalProposal, action: "accept" | "change") {
    setBusy(true); setError(null);
    const res = await proposalAction(proposal.id, action, action === "change" ? changeNote : undefined, proposal.snapshotChecksum);
    setBusy(false);
    if (res.ok) { setConfirmingAcceptance(null); setRequestingChanges(null); setChangeNote(""); router.refresh(); }
    else setError(res.error ?? "Something went wrong.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {proposals.map((p) => {
        const recurringMonthly = p.line_items.reduce((sum, item) => sum + (item.pricingType === "recurring" ? item.amount ?? 0 : 0), 0);
        return (
        <Card key={p.id}>
          <div style={{ ...row, alignItems: "center" }}>
            <strong>Proposal</strong>
            <Badge tone={TONE[p.status] ?? "neutral"} dot>{p.status.replace(/_/g, " ")}</Badge>
          </div>
          <div style={{ marginTop: "var(--space-2)" }}>
            {p.clientSnapshot?.proposal?.executiveSummary ? <p>{p.clientSnapshot.proposal.executiveSummary}</p> : null}
            {p.clientSnapshot?.proposal?.observedSituation ? <p>{p.clientSnapshot.proposal.observedSituation}</p> : null}
            {p.clientSnapshot?.proposal?.keyIssues?.length ? <section aria-label="Key issues">
              <h3>Key issues</h3>
              {p.clientSnapshot.proposal.keyIssues.map((item, i) => <p key={`issue-${i}`}><strong>{item.title}</strong>{item.detail ? ` — ${item.detail}` : ""}</p>)}
            </section> : null}
            {p.clientSnapshot?.proposal?.opportunities?.length ? <section aria-label="Opportunities">
              <h3>Opportunities</h3>
              {p.clientSnapshot.proposal.opportunities.map((item, i) => <p key={`opportunity-${i}`}><strong>{item.title}</strong>{item.detail ? ` — ${item.detail}` : ""}</p>)}
            </section> : null}
            {p.clientSnapshot?.narrative?.map((section, i) => <section key={section.key ?? i} aria-label={section.heading ?? "Proposal details"}>
              {section.heading ? <h3>{section.heading}</h3> : null}
              {section.paragraphs?.map((paragraph, j) => <p key={j}>{paragraph}</p>)}
            </section>)}
            {(p.line_items ?? []).map((li, i) => (
              <div key={i} style={row}>
                <span>{li.quantity ? `${li.quantity}× ` : ""}{li.label}{li.cadence ? ` · ${li.cadence}` : ""}{li.pricingType === "recurring" ? " recurring" : ""}</span>
                <span>{typeof li.amount === "number" ? money(li.amount, p.currency) : ""}</span>
              </div>
            ))}
          </div>
          {p.discountMinor > 0 ? <div style={row}><span>Discount</span><span>−{money(p.discountMinor, p.currency)}</span></div> : null}
          <div style={{ ...row, borderTop: "1px solid var(--border)", marginTop: "var(--space-2)", paddingTop: "var(--space-2)" }}>
            <strong>One-time total</strong><strong>{money(p.total, p.currency)}</strong>
          </div>
          {recurringMonthly > 0 ? <div style={row}><span>Recurring monthly</span><span>{money(recurringMonthly, p.currency)}</span></div> : null}
          {p.deposit > 0 ? <div style={row}><span>Deposit to start</span><span>{money(p.deposit, p.currency)}</span></div> : null}
          {p.validUntil ? <div style={row}><span>Valid until</span><span>{p.validUntil}</span></div> : null}
          {p.clientSnapshot?.proposal?.proposedNextStep ? <p><strong>Next step:</strong> {p.clientSnapshot.proposal.proposedNextStep}</p> : null}

          {(p.status === "sent" || p.status === "viewed") && p.isCurrent !== false ? (
            <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
              {confirmingAcceptance === p.id ? <div role="group" aria-label="Confirm proposal acceptance">
                <p>You are accepting the published proposal and its exact terms above. This does not create a contract or invoice.</p>
                <Button variant="primary" size="sm" disabled={busy} onClick={() => act(p, "accept")}>Confirm acceptance</Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirmingAcceptance(null)}>Cancel</Button>
              </div> : <Button variant="primary" size="sm" disabled={busy} onClick={() => { setConfirmingAcceptance(p.id); setRequestingChanges(null); }}>Accept proposal</Button>}
              {requestingChanges === p.id ? <div>
                <label>What would you like clarified or changed?
                  <textarea aria-label="Requested changes" value={changeNote} maxLength={2000} onChange={(event) => setChangeNote(event.target.value)} />
                </label>
                <Button variant="secondary" size="sm" disabled={busy || changeNote.trim().length < 5} onClick={() => act(p, "change")}>Submit change request</Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setRequestingChanges(null); setChangeNote(""); }}>Cancel</Button>
              </div> : <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setRequestingChanges(p.id); setConfirmingAcceptance(null); }}>Request changes</Button>}
            </div>
          ) : p.status === "accepted" ? (
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-success, #1a7f4b)", marginTop: "var(--space-2)" }}>Accepted. No contract, invoice, or payment was created.</p>
          ) : p.status === "change_requested" ? (
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: "var(--space-2)" }}>Changes requested — your team is revising this.</p>
          ) : p.status === "revised" || p.isCurrent === false ? (
            <p role="status" style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: "var(--space-2)" }}>Superseded by a newer proposal. This offer can no longer be accepted.</p>
          ) : p.status === "expired" ? (
            <p role="status" style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: "var(--space-2)" }}>This proposal has expired and can no longer be accepted.</p>
          ) : null}
        </Card>
      ); })}
      {error ? <p style={{ color: "var(--text-danger, #c0392b)", fontSize: "var(--fs-sm)" }}>{error}</p> : null}
    </div>
  );
}
