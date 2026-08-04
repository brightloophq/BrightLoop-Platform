/* =============================================================================
 * CRM connectors — provider-neutral data contracts (F4.5). PURE.
 *
 * The normalized CRM value objects every provider maps INTO. Provider-specific
 * field names, ids, and payload shapes are read inside each binding and collapsed
 * onto these bounded, neutral shapes; nothing HubSpot/Salesforce/Pipedrive-shaped
 * ever leaves the adapter layer. Common identifiers carry `provider` + `externalId`
 * (the installation/workspace ids are attached by the application layer). Additional
 * safe provider fields survive ONLY inside a bounded `metadata` object.
 *
 * Factories here just assemble the neutral object from already-extracted fields —
 * they perform no provider parsing (that stays in the binding). Undefined fields are
 * dropped so a normalized record never carries empty provider noise.
 * ========================================================================== */

export type CrmProvider = "hubspot" | "salesforce" | "pipedrive";

/** Cursor-based pagination, normalized across offset/after/next-link providers. */
export interface CRMPagination { nextCursor: string | null; hasMore: boolean }

export interface CRMContact {
  provider: CrmProvider;
  externalId: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyExternalId?: string;
  ownerExternalId?: string;
  createdAt?: string;
  updatedAt?: string;
  archived: boolean;
  metadata?: Record<string, unknown>;
}

export interface CRMCompany {
  provider: CrmProvider;
  externalId: string;
  displayName: string;
  name?: string;
  domain?: string;
  industry?: string;
  ownerExternalId?: string;
  createdAt?: string;
  updatedAt?: string;
  archived: boolean;
  metadata?: Record<string, unknown>;
}

/** A deal / opportunity. `status` is the normalized open/won/lost lifecycle. */
export interface CRMDeal {
  provider: CrmProvider;
  externalId: string;
  displayName: string;
  amount?: number;
  currency?: string;
  stageId?: string;
  stageName?: string;
  pipelineId?: string;
  status: "open" | "won" | "lost";
  ownerExternalId?: string;
  contactExternalId?: string;
  companyExternalId?: string;
  closeDate?: string;
  createdAt?: string;
  updatedAt?: string;
  archived: boolean;
  metadata?: Record<string, unknown>;
}

export interface CRMPipeline { provider: CrmProvider; externalId: string; displayName: string }
export interface CRMStage {
  provider: CrmProvider;
  externalId: string;
  displayName: string;
  pipelineExternalId?: string;
  order?: number;
  probability?: number;
  isWon?: boolean;
  isClosed?: boolean;
}
export interface CRMOwner { provider: CrmProvider; externalId: string; displayName: string; email?: string; active?: boolean }
export interface CRMActivity {
  provider: CrmProvider;
  externalId: string;
  displayName: string;
  type?: string;
  dueDate?: string;
  done?: boolean;
  ownerExternalId?: string;
  dealExternalId?: string;
  contactExternalId?: string;
  createdAt?: string;
}
export interface CRMNote {
  provider: CrmProvider;
  externalId: string;
  body: string;
  ownerExternalId?: string;
  dealExternalId?: string;
  contactExternalId?: string;
  createdAt?: string;
}

/** A normalized paginated result set for any list/search operation. */
export interface CRMSearchResult<T> { results: T[]; pagination: CRMPagination }

/** Strip undefined values so a normalized record carries no empty provider noise. */
export function compact<T extends object>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (v !== undefined) out[k] = v;
  return out;
}

/** Assemble a normalized pagination envelope. */
export function pagination(nextCursor: string | null, hasMore: boolean): CRMPagination {
  return { nextCursor, hasMore };
}
