"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@brightloop/ui";
import {
  setProposalDeposit, sendProposal, createContractForProposal, sendContract,
  countersignContract, createDepositInvoice, sendInvoice,
} from "../../sales-actions";

export interface FlowProposal { id: string; status: string; total: number; deposit: number; line_items: { label: string; amount?: number }[] }
export type FlowContract = { id: string; status: string; client_signature: string | null } | null;
export type FlowInvoice = { id: string; status: string; amount: number } | null;

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "var(--space-3)", padding: "3px 0", fontSize: "var(--fs-sm)", alignItems: "center" };
const step: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--space-2)" };

/**
 * Admin sales flow — one screen drives the whole loop:
 * proposal (set deposit → send) → contract (create → send → countersign+activate)
 * → deposit invoice (create → send) → client pays → activation.
 * Every button calls a guarded server action.
 */
export function SalesFlow({ proposal, contract, invoice }: { proposal: FlowProposal; contract: FlowContract; invoice: FlowInvoice }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <div key={i} style={row}><span>{li.label}</span><span>{typeof li.amount === "number" ? money(li.amount) : ""}</span></div>
        ))}
        <div style={{ ...row, borderTop: "1px solid var(--border)", marginTop: "var(--space-2)", paddingTop: "var(--space-2)" }}>
          <strong>Total</strong><strong>{money(proposal.total)}</strong>
        </div>
        <div style={row}><span>Deposit</span><span>{money(proposal.deposit)}</span></div>

        {proposal.status === "draft" ? (
          <div style={{ ...step, marginTop: "var(--space-3)" }}>
            <form action={(fd) => { fd.set("proposalId", proposal.id); run(() => setProposalDeposit(fd)); }} style={{ display: "flex", gap: "var(--space-2)" }}>
              <input name="depositDollars" type="number" min="0" placeholder="Deposit ($)" defaultValue={proposal.deposit ? proposal.deposit / 100 : ""} aria-label="Deposit in dollars" />
              <Button type="submit" variant="secondary" size="sm" disabled={busy}>Set deposit</Button>
            </form>
            <Button variant="primary" size="sm" disabled={busy} onClick={() => run(() => sendProposal(proposal.id))}>Send proposal to client</Button>
          </div>
        ) : proposal.status === "sent" || proposal.status === "viewed" ? (
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: "var(--space-2)" }}>Awaiting the client&apos;s decision.</p>
        ) : proposal.status === "change_requested" ? (
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: "var(--space-2)" }}>Client requested changes — revise and resend.</p>
        ) : null}
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
              <div style={row}><span>Amount</span><span>{money(invoice.amount)}</span></div>
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
