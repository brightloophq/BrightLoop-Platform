"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@brightloop/ui";
import { proposalAction } from "../../portal-sales-actions";

export interface ProposalLine { label: string; amount?: number; quantity?: number; description?: string }
export interface PortalProposal {
  id: string;
  status: string;
  subtotal: number;
  total: number;
  deposit: number;
  line_items: ProposalLine[];
}

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const TONE: Record<string, "warning" | "success" | "danger" | "neutral"> = {
  sent: "warning", viewed: "warning", accepted: "success", change_requested: "neutral", revised: "warning", expired: "neutral",
};
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "var(--space-3)", padding: "2px 0", fontSize: "var(--fs-sm)" };

/** Client proposal review — accept or request changes. Draft proposals never reach here (RLS). */
export function ProposalReview({ proposals }: { proposals: PortalProposal[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mark sent proposals viewed on open.
  useEffect(() => {
    const unseen = proposals.filter((p) => p.status === "sent");
    if (unseen.length === 0) return;
    (async () => { for (const p of unseen) await proposalAction(p.id, "view"); router.refresh(); })();
    // Keyed on id:status so it re-runs only when a proposal is added or changes.
  }, [proposals.map((p) => `${p.id}:${p.status}`).join(",")]);

  async function act(id: string, action: "accept" | "change") {
    setBusy(true); setError(null);
    const res = await proposalAction(id, action);
    setBusy(false);
    if (res.ok) router.refresh(); else setError(res.error ?? "Something went wrong.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {proposals.map((p) => (
        <Card key={p.id}>
          <div style={{ ...row, alignItems: "center" }}>
            <strong>Proposal</strong>
            <Badge tone={TONE[p.status] ?? "neutral"} dot>{p.status.replace(/_/g, " ")}</Badge>
          </div>
          <div style={{ marginTop: "var(--space-2)" }}>
            {(p.line_items ?? []).map((li, i) => (
              <div key={i} style={row}>
                <span>{li.quantity ? `${li.quantity}× ` : ""}{li.label}</span>
                <span>{typeof li.amount === "number" ? money(li.amount) : ""}</span>
              </div>
            ))}
          </div>
          <div style={{ ...row, borderTop: "1px solid var(--border)", marginTop: "var(--space-2)", paddingTop: "var(--space-2)" }}>
            <strong>Total</strong><strong>{money(p.total)}</strong>
          </div>
          {p.deposit > 0 ? <div style={row}><span>Deposit to start</span><span>{money(p.deposit)}</span></div> : null}

          {p.status === "sent" || p.status === "viewed" ? (
            <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
              <Button variant="primary" size="sm" disabled={busy} onClick={() => act(p.id, "accept")}>Accept proposal</Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => act(p.id, "change")}>Request changes</Button>
            </div>
          ) : p.status === "accepted" ? (
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-success, #1a7f4b)", marginTop: "var(--space-2)" }}>Accepted — your contract is on the way.</p>
          ) : p.status === "change_requested" ? (
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: "var(--space-2)" }}>Changes requested — your team is revising this.</p>
          ) : null}
        </Card>
      ))}
      {error ? <p style={{ color: "var(--text-danger, #c0392b)", fontSize: "var(--fs-sm)" }}>{error}</p> : null}
    </div>
  );
}
