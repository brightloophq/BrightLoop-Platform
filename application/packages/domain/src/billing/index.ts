/* =============================================================================
 * Billing & Subscription domain (Phase F · F5) — pure logic + repository ports.
 *
 * The commercial layer over the certified platform. Everything here is pure and
 * deterministic (clocks taken as ISO strings); orchestration lives in
 * @brightloop/application. Stripe is REUSED via the commerce connector — this
 * package never imports a payment SDK.
 * ========================================================================== */

export * from "./plans.js";
export * from "./entitlements.js";
export * from "./usage.js";
export * from "./idempotency.js";
export * from "./lifecycle.js";
export * from "./engine.js";
export * from "./notifications.js";
export * from "./repository.js";
// Event taxonomy — namespaced to avoid colliding with other `*Events` modules.
export * as billingEvents from "./events.js";
