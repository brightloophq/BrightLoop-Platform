import { describe, expect, it } from "vitest";
import { formatQuoteMoney, quoteWorkspaceSummary, reconcileCommercialSave, type WorkspaceQuoteItem } from "./quote-workspace";

const item = (patch: Partial<WorkspaceQuoteItem> = {}): WorkspaceQuoteItem => ({
  id: "qit_1", label: "Work", description: "", quantity: 1, unit_amount: 100,
  amount: 100, sort: 0, pricing_type: "one_time", recurrence_cadence: null,
  optional: false, source_work_item_id: null, source_evidence_refs: [], ...patch,
});

describe("quote workspace presentation and reconciliation", () => {
  it("formats valid currency but keeps partial input renderable", () => {
    expect(formatQuoteMoney(100, "USD")).toContain("1.00");
    expect(formatQuoteMoney(100, "")).toBe("—");
    expect(formatQuoteMoney(100, "US")).toBe("—");
  });

  it("reports mixed cadence without fabricating a summary", () => {
    const result = quoteWorkspaceSummary([
      item({ pricing_type: "recurring", recurrence_cadence: "monthly" }),
      item({ id: "qit_2", pricing_type: "recurring", recurrence_cadence: "annual" }),
    ], 0);
    expect(result.summary).toBeNull();
    expect(result.error).toContain("shared cadence");
  });

  it("adopts persisted item identity and authoritative summary after save", () => {
    const persisted = item({ id: "qit_persisted", unit_amount: 0, amount: 0 });
    const result = reconcileCommercialSave({
      updatedAt: "2026-09-06T12:00:00Z", subtotal: 0, discount: 0, total: 0,
      recurringTotal: 0, recurringCadence: null, optionalOneTimeTotal: 0,
      optionalRecurringTotal: 0, pricingComplete: true, itemCount: 1, items: [persisted],
    });
    expect(result.items[0]?.id).toBe("qit_persisted");
    expect(result.summary).toMatchObject({ total: 0, complete: true });
    expect(result.expectedUpdatedAt).toBe("2026-09-06T12:00:00Z");
  });
});
