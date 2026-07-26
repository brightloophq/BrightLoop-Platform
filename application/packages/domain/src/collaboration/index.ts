/* =============================================================================
 * Collaboration (Phase D · Sprint D7) — domain barrel.
 *
 * The bounded context for operational awareness: subscriptions, mentions,
 * internal-only notifications, a per-user inbox, read receipts, and a
 * first-class activity feed over the existing append-only activity log. Pure —
 * every service here is deterministic and io-free.
 * ========================================================================== */

export * from "./subscription.js";
export * from "./mention.js";
export * from "./notification.js";
export * from "./inbox.js";
export * from "./read-receipt.js";
export * from "./feed.js";
export * from "./repository.js";
