import { commercialQuoteSummary, type CommercialQuoteSummary, type QuotePricingType, type QuoteRecurrenceCadence } from "@brightloop/domain";

export type WorkspaceQuoteItem = {
  id: string | null;
  label: string;
  description: string;
  quantity: number;
  unit_amount: number | null;
  amount: number | null;
  sort: number;
  pricing_type: QuotePricingType;
  recurrence_cadence: QuoteRecurrenceCadence | null;
  optional: boolean;
  source_work_item_id: string | null;
  source_evidence_refs: unknown;
};

export type CommercialSaveResponse = {
  updatedAt: string;
  subtotal: number;
  discount: number;
  total: number;
  recurringTotal: number;
  recurringCadence: QuoteRecurrenceCadence | null;
  optionalOneTimeTotal: number;
  optionalRecurringTotal: number;
  pricingComplete: boolean;
  itemCount: number;
  items: WorkspaceQuoteItem[];
};

export function formatQuoteMoney(amount: number, currency: string): string {
  if (!/^[A-Z]{3}$/.test(currency)) return "—";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount / 100);
  } catch {
    return "—";
  }
}

export function quoteWorkspaceSummary(items: readonly WorkspaceQuoteItem[], discount: number): {
  summary: CommercialQuoteSummary | null;
  error: string | null;
} {
  try {
    return {
      summary: commercialQuoteSummary(items.map((item) => ({
        quantity: item.quantity,
        unitAmount: item.unit_amount,
        pricingType: item.pricing_type,
        recurrenceCadence: item.recurrence_cadence,
        optional: item.optional,
      })), discount),
      error: null,
    };
  } catch {
    return { summary: null, error: "Recurring items must use one shared cadence." };
  }
}

export function reconcileCommercialSave(response: CommercialSaveResponse): {
  expectedUpdatedAt: string;
  items: WorkspaceQuoteItem[];
  summary: CommercialQuoteSummary;
} {
  return {
    expectedUpdatedAt: response.updatedAt,
    items: response.items,
    summary: {
      subtotal: response.subtotal,
      discount: response.discount,
      total: response.total,
      recurringTotal: response.recurringTotal,
      recurringCadence: response.recurringCadence,
      optionalOneTimeTotal: response.optionalOneTimeTotal,
      optionalRecurringTotal: response.optionalRecurringTotal,
      complete: response.pricingComplete,
    },
  };
}
