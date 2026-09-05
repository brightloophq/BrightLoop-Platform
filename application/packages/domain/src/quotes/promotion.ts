export interface ScannerRecommendedWork {
  sourceId: string;
  title: string;
  solution: string;
  evidenceIds: string[];
}

export interface PromotedQuoteItemSeed {
  label: string;
  description: string;
  sort: number;
  sourceWorkItemId: string;
  sourceEvidenceRefs: string[];
  quantity: 1;
  unitAmount: 0;
  amount: 0;
  pricingType: "one_time";
  recurrenceCadence: null;
  optional: false;
  moduleId: null;
}

/** Stable identity for one approval of one immutable scanner proposal version. */
export function scannerPackagePromotionKey(runId: string, proposalVersionId: string, reviewEventId: string): string {
  return `promo:${runId}:${proposalVersionId}:${reviewEventId}`;
}

/** Seed commercial scope without importing scanner estimates into quote pricing. */
export function scannerWorkToQuoteItemSeeds(work: readonly ScannerRecommendedWork[]): PromotedQuoteItemSeed[] {
  return work.map((item, sort) => ({
    label: item.title,
    description: item.solution,
    sort,
    sourceWorkItemId: item.sourceId,
    sourceEvidenceRefs: [...item.evidenceIds],
    quantity: 1,
    unitAmount: 0,
    amount: 0,
    pricingType: "one_time",
    recurrenceCadence: null,
    optional: false,
    moduleId: null,
  }));
}
