/* =============================================================================
 * Finance connectors — provider-neutral data contracts (F4.6). PURE.
 *
 * The normalized finance value objects every provider maps INTO. Provider-specific
 * field names, ids, and payload shapes are read inside each binding and collapsed onto
 * these bounded, neutral shapes; nothing QuickBooks/Xero-shaped ever leaves the
 * adapter layer. Common identifiers carry `provider` + `externalId` (the
 * installation/workspace ids are attached by the application layer). Additional safe
 * provider fields survive ONLY inside a bounded `metadata` object.
 *
 * Factories here just assemble the neutral object from already-extracted fields — they
 * perform no provider parsing (that stays in the binding). Undefined fields are dropped
 * so a normalized record never carries empty provider noise.
 * ========================================================================== */

export type FinanceProvider = "quickbooks" | "xero";

/** Cursor-based pagination, normalized across offset/page/next-link providers. */
export interface FinancePagination { nextCursor: string | null; hasMore: boolean }

export interface FinanceCompany {
  provider: FinanceProvider;
  externalId: string;
  displayName: string;
  legalName?: string;
  country?: string;
  currency?: string;
  fiscalYearStartMonth?: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

export interface FinanceAccount {
  provider: FinanceProvider;
  externalId: string;
  displayName: string;
  code?: string;
  type?: string;
  classification?: string;
  currency?: string;
  active: boolean;
  metadata?: Record<string, unknown>;
}

export interface FinanceCustomer {
  provider: FinanceProvider;
  externalId: string;
  displayName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  currency?: string;
  balance?: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

/** An invoice. `status` is the normalized open/paid/void lifecycle. */
export interface FinanceInvoice {
  provider: FinanceProvider;
  externalId: string;
  number?: string;
  customerExternalId?: string;
  status: "draft" | "open" | "paid" | "void";
  currency?: string;
  total?: number;
  balance?: number;
  issueDate?: string;
  dueDate?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface FinancePayment {
  provider: FinanceProvider;
  externalId: string;
  customerExternalId?: string;
  invoiceExternalId?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  paidDate?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface FinanceExpense {
  provider: FinanceProvider;
  externalId: string;
  vendorExternalId?: string;
  accountExternalId?: string;
  amount?: number;
  currency?: string;
  paymentType?: string;
  reference?: string;
  spentDate?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface FinanceItem {
  provider: FinanceProvider;
  externalId: string;
  displayName: string;
  code?: string;
  type?: string;
  unitPrice?: number;
  currency?: string;
  active: boolean;
  metadata?: Record<string, unknown>;
}

export interface FinanceTax {
  provider: FinanceProvider;
  externalId: string;
  displayName: string;
  rate?: number;
  active: boolean;
  metadata?: Record<string, unknown>;
}

export interface FinanceHealth {
  healthy: boolean;
  provider: FinanceProvider;
  companyExternalId?: string;
}

/** A normalized paginated result set for any list operation. */
export interface FinanceSearchResult<T> { results: T[]; pagination: FinancePagination }

/** Strip undefined values so a normalized record carries no empty provider noise. */
export function compact<T extends object>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (v !== undefined) out[k] = v;
  return out;
}

/** Assemble a normalized pagination envelope. */
export function pagination(nextCursor: string | null, hasMore: boolean): FinancePagination {
  return { nextCursor, hasMore };
}
