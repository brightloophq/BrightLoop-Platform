"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card } from "@brightloop/ui";
import {
  setProposalDeposit, sendProposal, publishScannerSalesProposal, createScannerSalesRevision, createContractForProposal, sendContract,
  countersignContract, createDepositInvoice, sendInvoice,
} from "../../sales-actions";

export interface FlowProposal { id: string; status: string; total: number; deposit: number; currency: string; discountMinor: number; validUntil: string | null; line_items: { label: string; amount?: number; quantity?: number; unitAmountMinor?: number; pricingType?: string; cadence?: string | null }[] }
export type FlowContract = { id: string; status: string; client_signature: string | null } | null;
export type FlowInvoice = { id: string; status: string; amount: number } | null;
export interface ScannerDeliveryPreview {
  proposalId: string; clientId: string; company: string; status: string; currency: string;
  subtotalMinor: number; discountMinor: number; totalMinor: number; depositMinor: number;
  validUntil: string | null;
  lineItems: { label: string; description?: string | null; amount?: number; quantity?: number; cadence?: string | null }[];
  recipients: { id: string; name: string; email: string }[];
  eligible: boolean; reason: string | null; published: boolean;
  isCurrent?: boolean; predecessorProposalId?: string | null; snapshotChecksum?: string;
}
export interface ScannerRevisionContext {
  isScannerProposal: boolean; runId?: string; conversionId?: string; headProposalId?: string;
  predecessorProposalId?: string | null; isCurrent?: boolean;
  history?: { proposalId: string; status: string; predecessorProposalId?: string | null; publishedAt?: string | null; current?: boolean;
    response?: { kind: string; note: string; createdAt: string; actorId: string }[] }[];
}

const money = (c: number, currency: string) => {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(c / 100); }
  catch { return `${currency} ${(c / 100).toFixed(2)}`; }
};
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "var(--space-3)", padding: "3px 0", fontSize: "var(--fs-sm)", alignItems: "center" };
const step: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--space-2)" };

/**
 * Admin sales flow — one screen drives the whole loop:
 * proposal (set deposit → send) → contract (create → send → countersign+activate)
 * → deposit invoice (create → send) → client pays → activation.
 * Every button calls a guarded server action.
 */
export function SalesFlow({ proposal, contract, invoice, delivery, revisionContext, predecessor, isScannerConverted = false }: {
  proposal: FlowProposal; contract: FlowContract; invoice: FlowInvoice;
  delivery: ScannerDeliveryPreview | null; revisionContext?: ScannerRevisionContext | null;
  predecessor?: FlowProposal | null; isScannerConverted?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecipient, setSelectedRecipient] = useState("");
  const [confirmPublication, setConfirmPublication] = useState(false);
  const recurringMonthly = proposal.line_items.reduce((sum, item) => sum + (item.pricingType === "recurring" ? item.amount ?? 0 : 0), 0);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setError(null);
    const res = await fn();
    setBusy(false);
    if (res.ok) router.refresh(); else setError(res.error ?? "Something went wrong.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* ---- proposal ---- */}
      <Card>
        <div style={{ ...row, marginBottom: "var(--space-2)" }}>
          <strong>Proposal</strong>
          <Badge tone="neutral" dot>{proposal.status.replace(/_/g, " ")}</Badge>
        </div>
        {proposal.line_items.map((li, i) => (
          <div key={i} style={row}><span>{li.quantity && li.quantity > 1 ? `${li.quantity} × ` : ""}{li.label}{li.cadence ? ` · ${li.cadence}` : ""}{li.pricingType === "recurring" ? " recurring" : ""}</span><span>{typeof li.amount === "number" ? money(li.amount, proposal.currency) : ""}</span></div>
        ))}
        {predecessor ? <details style={{ marginTop: "var(--space-2)" }}>
          <summary>Compare with predecessor proposal {predecessor.id}</summary>
          <p>Previous one-time total: {money(predecessor.total, predecessor.currency)} · Current: {money(proposal.total, proposal.currency)}</p>
          <p>Previous discount: {money(predecessor.discountMinor, predecessor.currency)} · Current: {money(proposal.discountMinor, proposal.currency)}</p>
          <p>Previous expiry: {predecessor.validUntil ?? "none"} · Current: {proposal.validUntil ?? "none"}</p>
          <ul>{predecessor.line_items.map((line, index) => <li key={`old-${index}`}>{line.label}: {line.quantity ?? 1} × {line.amount !== undefined ? money(line.amount, predecessor.currency) : "—"}</li>)}
            {proposal.line_items.map((line, index) => <li key={`new-${index}`}>Current: {line.label}: {line.quantity ?? 1} × {line.amount !== undefined ? money(line.amount, proposal.currency) : "—"}</li>)}</ul>
        </details> : null}
        {proposal.discountMinor > 0 ? <div style={row}><span>Discount</span><span>−{money(proposal.discountMinor, proposal.currency)}</span></div> : null}
        <div style={{ ...row, borderTop: "1px solid var(--border)", marginTop: "var(--space-2)", paddingTop: "var(--space-2)" }}>
          <strong>One-time total</strong><strong>{money(proposal.total, proposal.currency)}</strong>
        </div>
        {recurringMonthly > 0 ? <div style={row}><span>Recurring monthly</span><span>{money(recurringMonthly, proposal.currency)}</span></div> : null}
        <div style={row}><span>Deposit</span><span>{money(proposal.deposit, proposal.currency)}</span></div>
        {proposal.validUntil ? <div style={row}><span>Valid until</span><span>{proposal.validUntil}</span></div> : null}

        {proposal.status === "draft" && !isScannerConverted ? (
          <div style={{ ...step, marginTop: "var(--space-3)" }}>
            <form action={(fd) => { fd.set("proposalId", proposal.id); run(() => setProposalDeposit(fd)); }} style={{ display: "flex", gap: "var(--space-2)" }}>
              <input name="depositDollars" type="number" min="0" placeholder={`Deposit (${proposal.currency})`} defaultValue={proposal.deposit ? proposal.deposit / 100 : ""} aria-label={`Deposit in ${proposal.currency}`} />
              <Button type="submit" variant="secondary" size="sm" disabled={busy}>Set deposit</Button>
            </form>
            <Button variant="primary" size="sm" disabled={busy} onClick={() => run(() => sendProposal(proposal.id))}>Send proposal to client</Button>
          </div>
        ) : proposal.status === "draft" && isScannerConverted ? (
          <div style={{ ...step, marginTop: "var(--space-3)" }}>
            <p role="status">Private scanner sales draft — not visible in the client portal.</p>
            {!delivery ? <p>Publication eligibility could not be loaded. Reload this proposal.</p> : <>
              <p>{delivery.eligible ? "Eligible for portal publication after final confirmation." : delivery.reason}</p>
              {delivery.recipients.length > 0 ? <label style={step}>
                Portal recipient
                <select aria-label="Portal recipient" value={selectedRecipient || delivery.recipients[0]?.id || ""}
                  onChange={(event) => { setSelectedRecipient(event.target.value); setConfirmPublication(false); }}>
                  {delivery.recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name} — {recipient.email}</option>)}
                </select>
              </label> : null}
              {delivery.eligible && delivery.recipients.length > 0 && !confirmPublication ? (
                <Button variant="primary" size="sm" onClick={() => setConfirmPublication(true)}>Review portal publication</Button>
              ) : null}
              {confirmPublication && delivery.eligible ? (() => {
                const recipient = delivery.recipients.find((candidate) => candidate.id === (selectedRecipient || delivery.recipients[0]?.id));
                if (!recipient) return <p>No valid portal recipient is available.</p>;
                return <div aria-label="Confirm portal publication" style={{ ...step, border: "1px solid var(--border)", padding: "var(--space-3)" }}>
                  <strong>Confirm portal publication</strong>
                  <div style={row}><span>Recipient</span><span>{recipient.name} · {recipient.email}</span></div>
                  <div style={row}><span>Client</span><span>{delivery.company}</span></div>
                  <div style={row}><span>Proposal</span><span>{delivery.proposalId}</span></div>
                  {delivery.lineItems.map((item, index) => <div key={index} style={row}>
                    <span>{item.quantity && item.quantity > 1 ? `${item.quantity} × ` : ""}{item.label}{item.cadence ? ` · ${item.cadence}` : ""}</span>
                    <span>{typeof item.amount === "number" ? money(item.amount, delivery.currency) : ""}</span>
                  </div>)}
                  <div style={row}><span>One-time total</span><span>{money(delivery.totalMinor, delivery.currency)}</span></div>
                  <div style={row}><span>Discount</span><span>{money(delivery.discountMinor, delivery.currency)}</span></div>
                  <div style={row}><span>Deposit</span><span>{money(delivery.depositMinor, delivery.currency)}</span></div>
                  <div style={row}><span>Valid until</span><span>{delivery.validUntil}</span></div>
                  <p>Publishing makes this proposal visible in the client portal. It does not send email or record client acceptance.</p>
                  <div style={{ display: "flex", gap: "var(--space-2)" }}>
                    <Button variant="primary" size="sm" disabled={busy} onClick={() => run(() => publishScannerSalesProposal({
                      proposalId: delivery.proposalId, clientId: delivery.clientId, recipientUserId: recipient.id,
                      currency: delivery.currency, totalMinor: delivery.totalMinor, validUntil: delivery.validUntil!,
                    }))}>Confirm and publish</Button>
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirmPublication(false)}>Cancel</Button>
                  </div>
                </div>;
              })() : null}
            </>}
          </div>
        ) : proposal.status === "sent" || proposal.status === "viewed" ? (
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: "var(--space-2)" }}>{isScannerConverted ? "Published to the client portal. No email was sent." : "Awaiting the client&apos;s decision."}</p>
        ) : proposal.status === "change_requested" ? (
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: "var(--space-2)" }}>Client requested changes — revise and resend.</p>
        ) : null}
        {isScannerConverted && revisionContext?.isCurrent && proposal.status !== "accepted" && proposal.status !== "revised" && delivery?.published ? (
          <div style={{ ...step, marginTop: "var(--space-3)" }}>
            <strong>Commercial revision</strong>
            <p>A new pricing version needs fresh review approval before a separate private proposal can be created. The current published offer remains active until its approved successor is published.</p>
            {revisionContext.runId ? <Link href={`/admin/prospect-scanner/${revisionContext.runId}`}>Review or update scanner commercial pricing</Link> : null}
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(async () => {
              const result = await createScannerSalesRevision(proposal.id);
              if (result.ok && result.id) router.push(`/admin/proposals/${result.id}`);
              return result;
            })}>Prepare private revision</Button>
          </div>
        ) : null}
        {revisionContext?.history?.length ? <details style={{ marginTop: "var(--space-3)" }}>
          <summary>Proposal revision and client response history</summary>
          {revisionContext.history.map((entry) => <section key={entry.proposalId} style={step}>
            <p><Link href={`/admin/proposals/${entry.proposalId}`}>{entry.proposalId}</Link> · {entry.status}{entry.current ? " · current offer" : ""}</p>
            {entry.response?.map((response, index) => <p key={`${entry.proposalId}-${index}`}>{response.kind}: {response.note || "(no note)"}</p>)}
          </section>)}
        </details> : null}
      </Card>

      {/* ---- contract ---- */}
      {proposal.status === "accepted" || contract ? (
        <Card>
          <div style={{ ...row, marginBottom: "var(--space-2)" }}>
            <strong>Contract</strong>
            {contract ? <Badge tone="neutral" dot>{contract.status.replace(/_/g, " ")}</Badge> : <Badge tone="warning">not created</Badge>}
          </div>
          {!contract ? (
            <Button variant="primary" size="sm" disabled={busy} onClick={() => run(() => createContractForProposal(proposal.id))}>Create contract (SOW)</Button>
          ) : contract.status === "pending" ? (
            <Button variant="primary" size="sm" disabled={busy} onClick={() => run(() => sendContract(contract.id))}>Send for signature</Button>
          ) : contract.status === "sent" ? (
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>Awaiting the client&apos;s signature.</p>
          ) : contract.status === "signed_client" ? (
            <div style={step}>
              <p style={{ fontSize: "var(--fs-sm)" }}>Signed by <strong>{contract.client_signature}</strong>.</p>
              <Button variant="primary" size="sm" disabled={busy} onClick={() => run(() => countersignContract(contract.id))}>Countersign &amp; activate</Button>
            </div>
          ) : (
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-success, #1a7f4b)" }}>Contract {contract.status.replace(/_/g, " ")}.</p>
          )}
        </Card>
      ) : null}

      {/* ---- deposit invoice ---- */}
      {proposal.status === "accepted" || contract ? (
        <Card>
          <div style={{ ...row, marginBottom: "var(--space-2)" }}>
            <strong>Deposit invoice</strong>
            {invoice ? <Badge tone="neutral" dot>{invoice.status}</Badge> : <Badge tone="warning">not created</Badge>}
          </div>
          {!invoice ? (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => createDepositInvoice(proposal.id))}>Create deposit invoice</Button>
          ) : invoice.status === "draft" ? (
            <div style={step}>
              <div style={row}><span>Amount</span><span>{money(invoice.amount, proposal.currency)}</span></div>
              <Button variant="primary" size="sm" disabled={busy} onClick={() => run(() => sendInvoice(invoice.id))}>Send invoice</Button>
            </div>
          ) : invoice.status === "paid" ? (
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-success, #1a7f4b)" }}>Deposit paid.</p>
          ) : (
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>Invoice {invoice.status} — awaiting payment.</p>
          )}
        </Card>
      ) : null}

      {error ? <p style={{ color: "var(--text-danger, #c0392b)", fontSize: "var(--fs-sm)" }}>{error}</p> : null}
    </div>
  );
}
