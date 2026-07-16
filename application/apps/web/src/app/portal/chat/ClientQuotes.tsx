"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@brightloop/ui";
import { clientCanActOnQuote } from "@brightloop/domain";
import { clientQuoteAction } from "../../quote-actions";
import styles from "../../chat.module.css";

export interface ClientQuoteItem { id: string; label: string; quantity: number; amount: number }
export interface ClientQuote {
  id: string;
  title: string;
  status: string;
  total: number;
  client_note: string;
  items: ClientQuoteItem[];
}

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const STATUS_TONE: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  sent: "warning", viewed: "warning", revision_requested: "neutral", revised: "warning",
  accepted: "success", rejected: "danger", expired: "neutral", converted: "success",
};

/**
 * Client-facing quote cards. These render ONLY quotes the database chose to
 * return — the draft-quote gate means a draft or internal-review quote never
 * reaches this component. Actions go through the RPC-backed clientQuoteAction.
 *
 * On first render each sent quote is marked viewed (sent → viewed), so the
 * strategist sees it's been seen.
 */
export function ClientQuotes({ quotes }: { quotes: ClientQuote[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mark freshly-sent quotes as viewed.
  useEffect(() => {
    const unseen = quotes.filter((q) => q.status === "sent");
    if (unseen.length === 0) return;
    (async () => {
      for (const q of unseen) await clientQuoteAction(q.id, "view");
      router.refresh();
    })();
    // Keyed on the id:status set so this re-runs only when a quote is added or
    // its status changes — router/quotes are intentionally not in the deps.
  }, [quotes.map((q) => `${q.id}:${q.status}`).join(",")]);

  if (quotes.length === 0) return null;

  async function act(quoteId: string, action: "accept" | "reject" | "revise") {
    setBusy(true);
    setError(null);
    const res = await clientQuoteAction(quoteId, action);
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error ?? "Couldn't record that. Please try again.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
      {quotes.map((q) => (
        <Card key={q.id}>
          <div className={styles.ctxRow}>
            <strong>{q.title}</strong>
            <Badge tone={STATUS_TONE[q.status] ?? "neutral"} dot>{q.status.replace(/_/g, " ")}</Badge>
          </div>

          <div style={{ marginTop: "var(--space-2)" }}>
            {q.items.map((it) => (
              <div key={it.id} className={styles.ctxRow}>
                <span>{it.quantity}× {it.label}</span>
                <span>{money(it.amount)}</span>
              </div>
            ))}
          </div>
          <div className={styles.ctxRow} style={{ borderTop: "1px solid var(--border)", marginTop: "var(--space-2)", paddingTop: "var(--space-2)" }}>
            <strong>Total</strong><strong>{money(q.total)}</strong>
          </div>

          {q.client_note ? <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: "var(--space-2)" }}>{q.client_note}</p> : null}

          {clientCanActOnQuote(q.status) ? (
            <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
              <Button variant="primary" size="sm" disabled={busy} onClick={() => act(q.id, "accept")}>Accept</Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => act(q.id, "revise")}>Request changes</Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(q.id, "reject")}>Decline</Button>
            </div>
          ) : q.status === "accepted" ? (
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-success, #1a7f4b)", marginTop: "var(--space-2)" }}>You accepted this quote. Your team will follow up with next steps.</p>
          ) : q.status === "revision_requested" ? (
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: "var(--space-2)" }}>Changes requested — your strategist is revising this quote.</p>
          ) : null}
        </Card>
      ))}
      {error ? <p className={styles.err}>{error}</p> : null}
    </div>
  );
}
