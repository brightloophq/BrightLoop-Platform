/** Stable identity for one approval of one immutable scanner proposal version. */
export function scannerPackagePromotionKey(runId: string, proposalVersionId: string, reviewEventId: string): string {
  return `promo:${runId}:${proposalVersionId}:${reviewEventId}`;
}
