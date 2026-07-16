"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@brightloop/ui";
import { isQuoteVisibleToClient } from "@brightloop/domain";
import {
  createQuote,
  addQuoteItem,
  removeQuoteItem,
  updateQuoteMeta,
  addQuoteRevisionNote,
  submitQuoteForReview,
  sendQuote,
  markQuoteRevised,
  convertQuoteToProposal,
} from "../../quote-actions";
import styles from "../../chat.module.css";

export interface QuoteItem {
  id: string;
  label: string;
  description: string;
  quantity: number;
  unit_amount: number;
  amount: number;
}
export interface QuoteView {
  id: string;
  title: string;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  client_note: string;
  proposal_id: string | null;
  items: QuoteItem[];
}

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const EDITABLE = new Set(["draft", "internal_review", "revised"]);
const STATUS_TONE: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  draft: "neutral", internal_review: "warning", sent: "warning", viewed: "warning",
  revision_requested: "danger", revised: "neutral", accepted: "success", rejected: "danger",
  expired: "neutral", converted: "success",
};

/**
 * Admin quote builder — lives in the consulting workspace. Draft and
 * internal_review quotes are only ever rendered here; the client cannot load
 * them (draft-quote gate). Status moves go through the guarded quote actions.
 */
export function QuoteBuilder({ conversationId, clientId, quotes }: { conversationId: string; clientId: string; quotes: QuoteView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error ?? "Something went wrong.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div className={styles.ctxSection}>Quotes</div>

      {quotes.length === 0 ? (
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>No quote yet for this conversation.</p>
      ) : (
        quotes.map((q) => (
          <div key={q.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
            <div className={styles.ctxRow}>
              <strong>{q.title}</strong>
              <Badge tone={STATUS_TONE[q.status] ?? "neutral"} dot>{q.status.replace(/_/g, " ")}</Badge>
            </div>
            {!isQuoteVisibleToClient(q.status) ? (
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>Not yet visible to the client — send it to share.</p>
            ) : null}

            {/* line items */}
            <div style={{ marginTop: "var(--space-2)" }}>
              {q.items.length === 0 ? (
                <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>No line items.</p>
              ) : (
                q.items.map((it) => (
                  <div key={it.id} className={styles.ctxRow}>
                    <span>{it.quantity}× {it.label}</span>
                    <span style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                      {money(it.amount)}
                      {EDITABLE.has(q.status) ? (
                        <button
                          type="button"
                          onClick={() => run(() => { const fd = new FormData(); fd.set("itemId", it.id); fd.set("quoteId", q.id); return removeQuoteItem(fd); })}
                          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-danger, #c0392b)" }}
                          aria-label="Remove item"
                        >×</button>
                      ) : null}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className={styles.ctxRow} style={{ borderTop: "1px solid var(--border)", marginTop: "var(--space-2)", paddingTop: "var(--space-2)" }}>
              <span>Subtotal</span><span>{money(q.subtotal)}</span>
            </div>
            {q.discount > 0 ? <div className={styles.ctxRow}><span>Discount</span><span>−{money(q.discount)}</span></div> : null}
            <div className={styles.ctxRow}><strong>Total</strong><strong>{money(q.total)}</strong></div>

            {/* add-item form, only while editable */}
            {EDITABLE.has(q.status) ? (
              <form
                action={(fd) => { fd.set("quoteId", q.id); run(() => addQuoteItem(fd)); }}
                style={{ display: "grid", gridTemplateColumns: "1fr 60px 90px auto", gap: "var(--space-1)", marginTop: "var(--space-2)" }}
              >
                <input name="label" placeholder="Line item" required aria-label="Line item label" />
                <input name="quantity" type="number" min="1" defaultValue="1" aria-label="Quantity" />
                <input name="unitDollars" type="number" min="0" step="1" placeholder="$ each" aria-label="Unit price in dollars" />
                <Button type="submit" variant="secondary" size="sm" disabled={busy}>Add</Button>
              </form>
            ) : null}

            {/* status actions */}
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-3)" }}>
              {q.status === "draft" ? (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => submitQuoteForReview(q.id))}>Submit for review</Button>
              ) : null}
              {(q.status === "draft" || q.status === "internal_review" || q.status === "revised") ? (
                <Button size="sm" variant="primary" disabled={busy || q.items.length === 0} onClick={() => run(() => sendQuote(q.id))}>Send to client</Button>
              ) : null}
              {q.status === "revision_requested" ? (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => markQuoteRevised(q.id))}>Start revision</Button>
              ) : null}
              {q.status === "accepted" ? (
                <Button size="sm" variant="primary" disabled={busy} onClick={() => run(() => convertQuoteToProposal(q.id))}>Convert to proposal</Button>
              ) : null}
              {q.status === "converted" && q.proposal_id ? (
                <span style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>Converted → proposal {q.proposal_id}</span>
              ) : null}
            </div>

            {/* discount / client note + internal rationale, while editable */}
            {EDITABLE.has(q.status) ? (
              <details style={{ marginTop: "var(--space-3)" }}>
                <summary style={{ cursor: "pointer", fontSize: "var(--fs-sm)" }}>Discount, client note, internal rationale</summary>
                <form action={(fd) => { fd.set("quoteId", q.id); run(() => updateQuoteMeta(fd)); }} style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
                  <input name="discountDollars" type="number" min="0" placeholder="Discount ($)" defaultValue={q.discount ? q.discount / 100 : ""} aria-label="Discount in dollars" />
                  <textarea name="clientNote" placeholder="Note shown to the client" defaultValue={q.client_note} rows={2} aria-label="Client note" />
                  <Button type="submit" variant="secondary" size="sm" disabled={busy}>Save</Button>
                </form>
                <form action={(fd) => { fd.set("quoteId", q.id); run(() => addQuoteRevisionNote(fd)); }} style={{ display: "flex", gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
                  <textarea name="note" placeholder="Internal pricing rationale (never shown to client)" rows={2} aria-label="Internal rationale" style={{ flex: 1 }} />
                  <Button type="submit" variant="secondary" size="sm" disabled={busy}>Log</Button>
                </form>
              </details>
            ) : null}
          </div>
        ))
      )}

      <div>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => { const fd = new FormData(); fd.set("conversationId", conversationId); fd.set("clientId", clientId); return createQuote(fd); })}>
          + New quote
        </Button>
      </div>
      {error ? <p className={styles.err}>{error}</p> : null}
    </div>
  );
}
