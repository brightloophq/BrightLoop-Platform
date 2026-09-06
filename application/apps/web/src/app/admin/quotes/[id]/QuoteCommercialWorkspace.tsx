"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, OperationalPanel } from "@brightloop/ui";
import { type CommercialQuoteSummary, type QuotePricingType, type QuoteRecurrenceCadence } from "@brightloop/domain";
import { submitQuoteForReview } from "../../../quote-actions";
import { formatQuoteMoney, quoteWorkspaceSummary, reconcileCommercialSave, type CommercialSaveResponse, type WorkspaceQuoteItem } from "./quote-workspace";
import styles from "./quote-workspace.module.css";

type Quote = {
  id: string; title: string; status: string; currency: string; discount: number;
  client_note: string; valid_until: string | null; updated_at: string;
  commercial_mode: "legacy_client_quote" | "proposal_only";
  source_run_id: string | null; source_proposal_version_id: string | null; source_review_event_id: string | null;
  quote_items: WorkspaceQuoteItem[];
};

const cadenceOptions: QuoteRecurrenceCadence[] = ["weekly", "monthly", "quarterly", "annual"];

export function QuoteCommercialWorkspace({ quote, sourceProposal }: { quote: Quote; sourceProposal: { id: string; checksum: string; envelope: unknown } | null }) {
  const router = useRouter();
  const [title, setTitle] = useState(quote.title);
  const [currency, setCurrency] = useState(quote.currency);
  const [discount, setDiscount] = useState(quote.discount);
  const [validUntil, setValidUntil] = useState(quote.valid_until ?? "");
  const [clientNote, setClientNote] = useState(quote.client_note);
  const [items, setItems] = useState<WorkspaceQuoteItem[]>(quote.quote_items);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(quote.updated_at);
  const [authoritativeSummary, setAuthoritativeSummary] = useState<CommercialQuoteSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "warning"; text: string } | null>(null);
  const editable = quote.commercial_mode === "proposal_only" ? ["draft", "internal_review"].includes(quote.status) : ["draft", "internal_review", "revised"].includes(quote.status);
  const preview = useMemo(() => quoteWorkspaceSummary(items, discount), [items, discount]);
  const summary = authoritativeSummary ?? preview.summary;

  const update = (index: number, patch: Partial<WorkspaceQuoteItem>) => { setAuthoritativeSummary(null); setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item)); };
  const add = () => { setAuthoritativeSummary(null); setItems((current) => [...current, { id: null, label: "", description: "", quantity: 1, unit_amount: null, amount: null, sort: current.length, pricing_type: "one_time", recurrence_cadence: null, optional: false, source_work_item_id: null, source_evidence_refs: [] }]); };

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/internal/quotes/${quote.id}/commercial`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        expectedUpdatedAt, title, clientNote, currency, discount, validUntil: validUntil || null,
        items: items.map((item) => ({ id: item.id, label: item.label, description: item.description, quantity: item.quantity, unitAmount: item.unit_amount, pricingType: item.pricing_type, recurrenceCadence: item.recurrence_cadence, optional: item.optional })),
      }) });
      const body = await response.json() as ({ error?: string } & Partial<CommercialSaveResponse>);
      if (!response.ok || !body.updatedAt) { setMessage({ tone: "warning", text: response.status === 409 ? "This quote changed in another session. Refresh before saving again." : body.error ?? "Could not save quote." }); return; }
      const reconciled = reconcileCommercialSave(body as CommercialSaveResponse);
      setExpectedUpdatedAt(reconciled.expectedUpdatedAt);
      setItems(reconciled.items);
      setDiscount(reconciled.summary.discount);
      setAuthoritativeSummary(reconciled.summary);
      setMessage({ tone: "success", text: "Commercial scope and pricing saved." });
      router.refresh();
    } catch {
      setMessage({ tone: "warning", text: "Could not save quote." });
    } finally { setBusy(false); }
  }

  async function review() {
    setBusy(true); setMessage(null);
    const result = await submitQuoteForReview(quote.id);
    setBusy(false);
    if (!result.ok) setMessage({ tone: "warning", text: result.error ?? "Could not submit for review." });
    else router.refresh();
  }

  return <div className={styles.layout}>
    <OperationalPanel>
      <div className={styles.heading}><div><Badge tone="neutral" dot>{quote.commercial_mode.replaceAll("_", " ")}</Badge> <Badge tone="warning" dot>{quote.status.replaceAll("_", " ")}</Badge></div><span>{summary?.complete ? "Pricing complete" : "Pricing incomplete"}</span></div>
      <div className={styles.meta}>
        <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!editable} /></label>
        <label>Currency<input value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} disabled={!editable || items.some((item) => item.unit_amount !== null)} /></label>
        <label>One-time discount (minor units)<input type="number" min="0" step="1" value={discount} onChange={(event) => { setAuthoritativeSummary(null); setDiscount(Number(event.target.value)); }} disabled={!editable} /></label>
        <label>Valid until<input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} disabled={!editable} /></label>
      </div>
      <label className={styles.note}>Commercial note<textarea rows={3} value={clientNote} onChange={(event) => setClientNote(event.target.value)} disabled={!editable} /></label>
    </OperationalPanel>

    <OperationalPanel>
      <div className={styles.heading}><strong>Commercial items</strong>{editable ? <Button variant="secondary" size="sm" onClick={add}>Add item</Button> : null}</div>
      <div className={styles.items}>{items.map((item, index) => <div className={styles.item} key={item.id ?? `new-${index}`}>
        <div className={styles.itemHead}><strong>{item.source_work_item_id ? "Scanner-derived scope" : "Operator scope"}</strong>{editable ? <button type="button" onClick={() => { setAuthoritativeSummary(null); setItems((current) => current.filter((_, i) => i !== index)); }}>Remove</button> : null}</div>
        <input aria-label={`Item ${index + 1} label`} placeholder="Scope item" value={item.label} onChange={(event) => update(index, { label: event.target.value })} disabled={!editable} />
        <textarea aria-label={`Item ${index + 1} description`} placeholder="Commercial wording" value={item.description} onChange={(event) => update(index, { description: event.target.value })} disabled={!editable} />
        <div className={styles.controls}>
          <label>Quantity<input type="number" min="1" max="9999" step="1" value={item.quantity} onChange={(event) => update(index, { quantity: Number(event.target.value) })} disabled={!editable} /></label>
          <label>Unit amount (minor units)<input type="number" min="0" step="1" value={item.unit_amount ?? ""} placeholder="Unpriced" onChange={(event) => update(index, { unit_amount: event.target.value === "" ? null : Number(event.target.value) })} disabled={!editable} /></label>
          <label>Pricing<select value={item.pricing_type} onChange={(event) => update(index, { pricing_type: event.target.value as QuotePricingType, recurrence_cadence: event.target.value === "one_time" ? null : (item.recurrence_cadence ?? "monthly") })} disabled={!editable}><option value="one_time">One time</option><option value="recurring">Recurring</option></select></label>
          {item.pricing_type === "recurring" ? <label>Cadence<select value={item.recurrence_cadence ?? "monthly"} onChange={(event) => update(index, { recurrence_cadence: event.target.value as QuoteRecurrenceCadence })} disabled={!editable}>{cadenceOptions.map((value) => <option value={value} key={value}>{value}</option>)}</select></label> : null}
          <label className={styles.checkbox}><input type="checkbox" checked={item.optional} onChange={(event) => update(index, { optional: event.target.checked })} disabled={!editable} /> Optional</label>
        </div>
        {item.source_work_item_id ? <details><summary>Read-only scanner provenance</summary><code>{item.source_work_item_id}</code><pre>{JSON.stringify(item.source_evidence_refs, null, 2)}</pre></details> : null}
      </div>)}</div>
    </OperationalPanel>

    <OperationalPanel>
      <div className={styles.totals}>
        <span>Committed one-time subtotal</span><strong>{summary ? formatQuoteMoney(summary.subtotal, currency) : "—"}</strong>
        <span>Discount</span><strong>{summary ? `−${formatQuoteMoney(summary.discount, currency)}` : "—"}</strong>
        <span>Committed one-time total</span><strong>{summary ? formatQuoteMoney(summary.total, currency) : "—"}</strong>
        <span>Committed recurring</span><strong>{summary ? `${formatQuoteMoney(summary.recurringTotal, currency)} ${summary.recurringCadence ?? ""}` : "—"}</strong>
        <span>Optional one-time</span><strong>{summary ? formatQuoteMoney(summary.optionalOneTimeTotal, currency) : "—"}</strong>
        <span>Optional recurring</span><strong>{summary ? formatQuoteMoney(summary.optionalRecurringTotal, currency) : "—"}</strong>
      </div>
      {preview.error ? <Alert tone="warning" title="Invalid commercial configuration">{preview.error}</Alert> : null}
      {message ? <Alert tone={message.tone} title={message.tone === "success" ? "Saved" : "Could not save"}>{message.text}</Alert> : null}
      <div className={styles.actions}><Button onClick={save} disabled={!editable || busy || summary === null}>{busy ? "Saving…" : "Save scope & pricing"}</Button>{quote.status === "draft" ? <Button variant="secondary" onClick={review} disabled={busy}>Submit for internal review</Button> : null}</div>
    </OperationalPanel>

    {sourceProposal ? <OperationalPanel><div className={styles.heading}><strong>Scanner source · read only</strong><span>{sourceProposal.id}</span></div><p>Checksum: <code>{sourceProposal.checksum}</code></p><details><summary>Approved proposal intelligence snapshot</summary><pre className={styles.source}>{JSON.stringify(sourceProposal.envelope, null, 2)}</pre></details></OperationalPanel> : null}
  </div>;
}
